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
app.get('/recipe', (req, res) => {
  // Make the API request
  fetch(api_call)
    .then(response => response.json())
    .then(data => {
      // Handle the recipe data here
      const recipe = data.results[2];
      const id = recipe.id;

      const detailed_recipe = `https://api.spoonacular.com/recipes/${id}/information?apiKey=${api_key}`;

      // Nested API call to get detailed recipe information
      fetch(detailed_recipe)
        .then(response => response.json())
        .then(data => {
          console.log(data);
          const details = data;
          const ingredients = data.extendedIngredients;
          //console.log("ingredients here " + ingredients);

          // Nested API call to get recipe instructions
          const instructions_api_call = `https://api.spoonacular.com/recipes/${id}/analyzedInstructions?apiKey=${api_key}`;
          fetch(instructions_api_call)
            .then(response => response.json())
            .then(data => {
              const instructions = data[0].steps;
              data[0].steps.forEach(function(step) {
               // console.log(step.step);
              });

              // Nested API call to get nutritional info
              const nutrition_api_call = `https://api.spoonacular.com/recipes/${id}/nutritionWidget.json?apiKey=${api_key}`;
              fetch(nutrition_api_call)
                .then(response => response.json())
                .then(nutritionData => {
                  console.log(nutritionData);
                  const nutrition = nutritionData;

                  // Render the EJS template with the recipe data
                  res.render('recipe', { recipe: recipe, ingredients: ingredients, instructions: instructions, details: details, nutrition: nutrition });
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
});







app.use(express.static(__dirname + "/public"));

app.get("*", (req, res) => {
  res.status(404);
  res.render("404", { title: "Page Not Found",navLinks,currentURL: url.parse(req.url).pathname});
});


app.listen(port, () => {
	console.log("Node application listening on port "+port);
}); 





/**
 * Api Call Testing for recipe.ejs file
 * Please leave this at the bottom for now
 * */


/**Spoonacular API
 * */
const api_key = "3640854786784e75b2b4956ea4822dc5";


// Replace {query} with your search query
const query = "chicken";
const includeNutrition = true;

// Construct the API request URL
const api_call = `https://api.spoonacular.com/recipes/search?query=${query}&includeNutrition=${includeNutrition}&apiKey=${api_key}`;


// Make the API request
fetch(api_call)
  .then(response => response.json())
  .then(data => {
    // Handle the recipe data here
    //console.log(data.hits);
    const recipe = data.results[2];
    //console.log(recipe);


  })
  .catch(error => {
    // Handle any errors here
    console.error(error);
  });
 



 