require("./utils.js");

require('dotenv').config();
const url=require('url');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');
const saltRounds = 12;

/**
 * Html Scrapping
 */
const axios = require('axios');
const cheerio = require('cheerio');

const port = process.env.PORT || 3000;

const app = express();

const Joi = require("joi");

const { ObjectId } = require('mongodb');


const expireTime = 24 * 60 * 60 * 1000; //expires after 1 hour  (hours * minutes * seconds * millis)

/* secret information section */
const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_database = process.env.MONGODB_DATABASE;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;

const node_session_secret = process.env.NODE_SESSION_SECRET;
/* END secret section */

var {database} = include('databaseConnection');

const userCollection = database.db(mongodb_database).collection('users');
const favourites = database.db(mongodb_database).collection('favourites');


app.set('view engine', 'ejs');


app.use(express.urlencoded({extended: false}));

var mongoStore = MongoStore.create({
	mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/sessions`,
	crypto: {
		secret: mongodb_session_secret
	}
})

app.use(session({ 
    secret: node_session_secret,
	store: mongoStore, //default is memory store 
	saveUninitialized: false, 
	resave: true
}
));


//---------------------------------------home page------------------------------
app.get('/', (req, res) => {
  console.log(req.url);
  console.log(url.parse(req.url).pathname);
  const loggedin = req.session.loggedin;
  const username = req.session.username || '';
  res.render('index', { loggedin, username });
});



// Define a schema for validating user input
const schema = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

app.get('/signup', (req, res) => {
  res.render('signup');
});

app.post('/signup', async (req, res) => {
  try {
    // Validate the user input
    const { error, value } = schema.validate(req.body);
    if (error) {
      throw new Error(error.details[0].message);
    }

    // Check if the email is already in use
    const existingUser = await userCollection.findOne({ email: value.email });
    if (existingUser) {
      throw new Error('Email address is already in use');
    }

    // Hash the password using bcrypt
    const hashedPassword = await bcrypt.hash(value.password, 10);

    // Create a new user in the database
    const newUser = {
      name: value.name,
      email: value.email,
      password: hashedPassword,
      user_type: "user",
    };
    await userCollection.insertOne(newUser);

    // Create a session for the new user
    req.session.loggedin = true;
    req.session.username = value.name;

    // Redirect to the home area
    res.redirect('/home');
  } catch (err) {
    // Display an error message if something went wrong
    const errorMessage = err.message;
    res.render('signup', { errorMessage });
  }
});

app.get('/home', (req, res) => {
  if (!req.session.loggedin) {
    // User is not logged in, redirect to home page
    res.redirect('/');
  } else {
    // User is logged in, display home page
    var username = req.session.username;
    res.render('home', { username });
  }
});


app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.log(err);
    } else {
      res.redirect('/');
    }
  });
});


app.get('/nosql-injection', async (req,res) => {
	var username = req.query.user;

	if (!username) {
		res.send(`<h3>no user provided - try /nosql-injection?user=name</h3> <h3>or /nosql-injection?user[$ne]=name</h3>`);
		return;
	}
	console.log("user: "+username);

	const schema = Joi.string().max(20).required();
	const validationResult = schema.validate(username);

	if (validationResult.error != null) {  
	   console.log(validationResult.error);
	   res.send("<h1 style='color:darkred;'>A NoSQL injection attack was detected!!</h1>");
	   return;
	}	

	const result = await userCollection.find({username: username}).project({username: 1, password: 1, _id: 1}).toArray();

	console.log(result);

    res.send(`<h1>Hello ${username}</h1>`);
});


app.get('/login', (req, res) => {
  res.render('login', { errorMessage: null});
});

app.post('/login', async (req, res) => {
  const { error } = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }).validate(req.body);

  if (error) {
    res.status(400).send('Invalid input');
    return;
  }

  const { email, password } = req.body;
  const user = await userCollection.findOne({ email });

  if (user && await bcrypt.compare(password, user.password)) {
    req.session.loggedin = true;
    req.session.username = user.name;
    req.session.user = user;
    res.redirect('/home');
  } else {
    res.render('login', { errorMessage: 'User and password not found.'});
  }
});


// Assuming you are using Express.js to render the template
app.get('/recipe', (req, res) => {
  // Make the API request
  fetch(apiCall)
    .then(response => response.json())
    .then(data => {
      // Handle the recipe data here
      console.log(data.hits);
      const recipe = data.hits[0].recipe;
      const ingredients = recipe.ingredients;

      // Render the EJS template with the recipe data
      res.render('recipe', { recipe: recipe });
    })
    .catch(error => {
      // Handle any errors here
      console.error(error);
    });
});




app.use(express.static(__dirname + "/public"));

app.get("*", (req, res) => {
  res.status(404);
  res.render("404", { title: "Page Not Found",navLinks,currentURL: url.parse(req.url).pathname});
});


app.listen(port, () => {
	console.log("Node application listening on port "+port);
}); 




app.post('/favorite', (req, res) => {
  let username =req.session.username;
  const { label, totalTime, ingredientLines, calories, protein, carbs, fat } = req.body;
  const favoriteRecipe = { username, label, totalTime, ingredientLines, calories, protein, carbs, fat };

  favourites.insertOne(favoriteRecipe, (err, result) => {
    if (err) {
      console.log(err);
      res.sendStatus(500);
    } else {
      res.redirect('back');
    }
  });
});



/**
 * Api Call Testing for recipe.ejs file
 * Please leave this at the bottom for now
 * */


/**Edaman API Setup 
 * */
// Replace {your app ID} and {your app key} with your Edamam API credentials
const app_id = "e8912d59";
const app_key = "2183188cdf78bc95dfdf3cf28f15643c";


// Replace {query} with your search query
const query = "chicken";

// Construct the API request URL
const apiCall = `https://api.edamam.com/search?q=${query}&app_id=${app_id}&app_key=${app_key}`;

// Make the API request
fetch(apiCall)
  .then(response => response.json())
  .then(data => {
    // Handle the recipe data here
    //console.log(data.hits);
    const recipe = data.hits[0].recipe;
    console.log(recipe);
    const ingredients = recipe.ingredients;
    const instructions = recipe.url; // recipe instructions
    //console.log(instructions);
    //console.log(ingredients);
    //console.log(typeof recipe.totalNutrients.FAT.quantity);
    //console.log("Instruction test");
    //htmlScrap(instructions);


  })
  .catch(error => {
    // Handle any errors here
    console.error(error);
  });
 

  /**Spponacular Setup */
  /**
  // Replace {your api key} with your Spoonacular API key
const api_key = "05adf25cf1be4acbaf7a00dc9265edf3";

// Replace {query} with your search query
const query = "chicken";

// Construct the API request URL
const api_call = `https://api.spoonacular.com/recipes/search?query=${query}&apiKey=${api_key}`;

// Make the API request
fetch(api_call)
  .then(response => response.json())
  .then(data => {
    // Handle the recipe data here
    const recipe = data.results[0];
    // Get the recipe instructions
    const recipe_id = recipe.id;
    const instruction_api_call = `https://api.spoonacular.com/recipes/${recipe_id}/analyzedInstructions?apiKey=${api_key}`;
    fetch(instruction_api_call)
      .then(response => response.json())
      .then(instruction_data => {
        // Handle the instruction data here
        const instructions = instruction_data[0].steps.map(step => step.step);
        console.log(instructions);
      })
      .catch(error => {
        // Handle any errors here
        console.error(error);
      });
  })
  .catch(error => {
    // Handle any errors here
    console.error(error);
  });
*/

  function renderIngredients(recipe) {
    let html = '';
    recipe.ingredientLines.forEach(function(ingredient) {
      html += `<li>${ingredient}</li>`;
    });
    return html;
  }


  
  function htmlScrap(url) {
    axios.get(url)
      .then(response => {
        const $ = cheerio.load(response.data);
        const instructions = [];
  
        $('div#recipe__steps-content_1-0 ol li').each((i, el) => {
          instructions.push($(el).text().trim());
        });
  
        console.log(instructions);
      })
      .catch(error => {
        console.log(error);
      });
  }
  
  

  
