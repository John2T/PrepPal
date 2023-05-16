require("./utils.js");

require('dotenv').config();
const url=require('url');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');

//Jsonwebtoken to send OTP, reset password
const jwt = require('jsonwebtoken');

//NodeMailer to send email to user
const nodeMailer = require('nodemailer');

const saltRounds = 12;

const port = process.env.PORT || 3000;

const app = express();

const axios = require('axios'); // Import the axios library for making HTTP requests
const striptags = require('striptags');

function stripTags(html) {
  return striptags(html);
}


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

const jwt_secret = process.env.JWT_SECRET;
/* END secret section */

var {database} = include('databaseConnection');

const userCollection = database.db(mongodb_database).collection('users');
const favourites = database.db(mongodb_database).collection('favourites');


app.set('view engine', 'ejs');

app.use(express.json());

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


//---------------------------------------index page------------------------------
app.get('/', (req, res) => {
  //console.log(req.url);
  //console.log(url.parse(req.url).pathname);
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
//---------------------------------------home page------------------------------
app.get('/home', async (req, res) => {
  try {
    if (!req.session.loggedin) {
      // User is not logged in, redirect to home page
      res.redirect('/');
    } else {
      // Check if the session variable for recipe count exists, and initialize it if not
      if (!req.session.recipeCount) {
        req.session.recipeCount = 3;
      }

      // User is logged in
      var username = req.session.username;

      // Make an API request using axios
      const response = await axios.get('https://api.spoonacular.com/recipes/random', {
        params: {
          number: req.session.recipeCount, // Fetch the current recipe count
          tags: 'vegetarian,dessert',
          apiKey: 'c55f1cebd8b648a9a121f036ed8bc51b' // Replace with your actual Spoonacular API key
        }
      });

      // Retrieve the user's favorite recipes from the database
      const userEmail = req.session.email; // Assuming the user's email is stored in req.session.email
      const favoriteRecipes = await favourites.find({ email: userEmail }).limit(2).toArray(); // Limit the result to 2 recipes
      const favoriteRecipesNum = await favourites.find({ email: userEmail }).count(); // Count the number of favorite recipes

      console.log(favoriteRecipes);

      //console.log(response.data.recipes); // Check the structure of the API response

      const recipeData = response.data.recipes;
      res.render('home', { username, recipeData, favoriteRecipes, favoriteRecipesNum });
    }
  } catch (error) {
    //console.error('Error:', error);
    res.status(500).send('Internal Server Error----');
  }
});





app.post('/home/browsing', (req, res) => {
  try {
    // Check if the session variable for click count exists, and initialize it if not
    if (!req.session.clickCount) {
      req.session.clickCount = 0;
    }

    // Increment the click count
    req.session.clickCount += 1;

    // Check if the click count exceeds the limit
    if (req.session.clickCount <= 2) {
      // Increment the recipe count by 3
      req.session.recipeCount += 3;
    }

    // Redirect back to the home page
    res.redirect('/home');
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Internal Server Error---111');
  }
});




app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      //console.log(err);
    } else {
      res.redirect('/');
    }
  });
});

//-----------------------------------search page-----------------------------------
app.get('/search', (req, res) => {
  if(!req.session.loggedin) {
    res.redirect('/');
  }else{
    res.render('search');
  }
});
//---------------------------------------------------------------------------------

//-----------------------------------Forgot password-------------------------------
app.get('/forgotpassword', (req, res, next) =>{
  res.render('forgotPassword');
});

app.post('/forgotpassword', async (req, res, next) =>{
  const {email} = req.body;
  const existingUser = await userCollection.findOne({ email: email });
  //check if user exist
  if (!existingUser) {
    res.send('<p>user not registered</p>');
    return;
  //user exist and create OTP
  }
  const pwObj = await userCollection.findOne({email: email}, {projection: {password: 1, _id: 1, name: 1}});
  const pw = pwObj.password;
  const id = pwObj._id;
  const secret = jwt_secret + pw;
  const payload = {
    email: pwObj.email,
    id: pwObj.id
  }
  const token = jwt.sign(payload, secret, {expiresIn: "5m" });
  const link = `http://localhost:${port}/reset-password/${id}/${token}`;

  //console.log(link);
  res.send("A reset password link has been send to your email addess");
  


  //Use NodeMailer so send email to user
  const transporter = nodeMailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: 'preppal36@gmail.com',
      pass: process.env.APP_PASSWORD
    }
  });

  const info = await transporter.sendMail({
    from: 'PrepPal team <preppal36@gmail.com>',
    to: email,
    subject: `Reset Password for ${pwObj.name}`,
    html: link
  })
});
//---------------------------------------------------------------------------------

//------------------------------------Reset passsword------------------------------
app.get('/reset-password/:id/:token', async(req, res, next) =>{
  const {id, token} = req.params;
  //console.log
  
  //check if this id exist in database
  const existingId = await userCollection.findOne({ _id: ObjectId(id) });
  if(!existingId){
    return res.status(400).send('Invalid user ID');
  }

  //id is valid
  const secret = jwt_secret + existingId.password;
  try {
    const payload = jwt.verify(token, secret);
    res.render('resetPassword', {email: existingId.email});

  } catch (error) {
    //console.log(error.message);
    res.send(error.message);
  }
  
  //console.log(secret);
});

app.post('/reset-password/:id/:token', async (req, res, next) =>{
  const {id, token} = req.params;
  const {password, password2} = req.body;
  //console.log(password + " " + password2); 

    //check if this id exist in database
    const existingId = await userCollection.findOne({ _id: ObjectId(id) });
    if(!existingId){
      return res.status(400).send('Invalid user ID');
    }

    const secret = jwt_secret + existingId.password;
    try {
      const payload = jwt.verify(token, secret);
      //validate password and password2 should match
      if(String(password).trim() !== String(password2).trim()){
        return res.status(400).send('Passwords do not match');
      }
      //password match
      const hashedPassword = await bcrypt.hash(password, 10);

      // update the user's password in the database
      const result = await userCollection.updateOne(
      { _id: ObjectId(id) },
      { $set: { password: hashedPassword } }
      );

      res.redirect('/login');

    } catch (error) {
      //console.log(error.message);
      res.send(error.message);
    }
});
//---------------------------------------------------------------------------------


app.get('/nosql-injection', async (req,res) => {
	var username = req.query.user;

	if (!username) {
		res.send(`<h3>no user provided - try /nosql-injection?user=name</h3> <h3>or /nosql-injection?user[$ne]=name</h3>`);
		return;
	}
	//console.log("user: "+username);

	const schema = Joi.string().max(20).required();
	const validationResult = schema.validate(username);

	if (validationResult.error != null) {  
	   //console.log(validationResult.error);
	   res.send("<h1 style='color:darkred;'>A NoSQL injection attack was detected!!</h1>");
	   return;
	}	

	const result = await userCollection.find({username: username}).project({username: 1, password: 1, _id: 1}).toArray();

	//console.log(result);

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
    req.session.email = user.email;
    req.session.user = user;
    res.redirect('/home');
  } else {
    res.render('login', { errorMessage: 'User and password not found.'});
  }
});

//---------------------------------------recipe page------------------------------
app.get('/recipe/:id', (req, res) => {
  if (!req.session.loggedin){
    res.redirect('/login');
  }
  const recipeId = req.params.id;
  const api_key = "e8f2c8d49b43488b9f1b2822629feded";//change api-------------------------------------------------------------------------------------------
  const detailed_recipe = `https://api.spoonacular.com/recipes/${recipeId}/information?apiKey=${api_key}`;

  // Nested API call to get detailed recipe information
  fetch(detailed_recipe)
    .then(response => response.json())
    .then(data => {
      //console.log(data);
      const details = data;
      const ingredients = data.extendedIngredients;
      const instructions_api_call = `https://api.spoonacular.com/recipes/${recipeId}/analyzedInstructions?apiKey=${api_key}`;

      // Nested API call to get recipe instructions
      fetch(instructions_api_call)
        .then(response => response.json())
        .then(data => {
          const instructions = data[0].steps;
          data[0].steps.forEach(function(step) {
            // console.log(step.step);
          });

          // Nested API call to get nutritional info
          const nutrition_api_call = `https://api.spoonacular.com/recipes/${recipeId}/nutritionWidget.json?apiKey=${api_key}`;
          fetch(nutrition_api_call)
            .then(response => response.json())
            .then(nutritionData => {
              //console.log(nutritionData);
              const nutrition = nutritionData;

              //Favourite? Check
               // Check if the recipe is favorited
               const userEmail = req.session.email; // Assuming the user's email is stored in req.user.email
               checkRecipeIsFavourited(userEmail, recipeId)
               .then(isFavorited => {
                //console.log(isFavorited);
                 // Render the EJS template with the recipe data
             
                console.log("Recipe:" + isFavorited);
                 res.render('recipe', { recipe: details, ingredients: ingredients, instructions: instructions, details: details, nutrition: nutrition , isFavorited: isFavorited});
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

app.post('/favorite', async (req, res) => {
  if (!req.session.loggedin) {
    res.redirect('/login');
    return;
  }

  const email = req.session.email;
  const { recipeId } = req.body;

  try {
    const existingFavorite = await favourites.findOne({ email, recipeId });

    if (existingFavorite) {
      // Recipe is already favorited, so delete it
      await favourites.deleteOne({ email, recipeId });
      res.redirect('back');
    } else {
      // Recipe is not favorited, so save it
      const {
        title,
        image,
        details,
        healthScore,
        cookTime,
        wwPoints,
        servings,
        ingredients,
        cal,
        pro,
        carbs,
        fat,
        instructions
      } = req.body;

      const favorite = {
        email,
        recipeId,
        title,
        image,
        details,
        healthScore,
        cookTime,
        wwPoints,
        servings,
        ingredients: JSON.parse(ingredients),
        cal,
        pro,
        carbs,
        fat,
        instructions: JSON.parse(instructions)
      };

      await favourites.insertOne(favorite);
      res.redirect('back');
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});



app.get('/allFavourites', async (req, res) => {
  try {
    if (!req.session.loggedin) {
      // User is not logged in, redirect to home page or handle accordingly
      res.redirect('/');
      return;
    }
    const userFavorites = await favourites.find({ email: req.session.email }).toArray();

    // Convert userFavorites to JSON
    const jsonFavorites = JSON.stringify(userFavorites);

    // Pass the JSON data to the render template
    res.render('allFavourites', { favorites: jsonFavorites });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});


app.get('/allFavourites/:recipeId', (req, res) => {
  const recipeId = req.params.recipeId;

  // Favourite? Check
  // Check if the recipe is favorited
  const userEmail = req.session.email; // Assuming the user's email is stored in req.session.email
  checkRecipeIsFavourited(userEmail, recipeId)
    .then(isFavorited => {
      // Find the favorite recipe
      favourites.findOne({ recipeId: recipeId }, (err, favoriteRecipe) => {
        if (err) {
          console.error(err);
          res.render('recipeNotFound');
          return;
        }

        if (favoriteRecipe) {
          // Render the recipe page template with the favorite recipe details
          res.render('favouriteRecipe', { recipe: favoriteRecipe, isFavorited: isFavorited });
        } else {
          // Handle the case where the recipe is not found
          res.redirect('/allFavourites');
        }
      });
    })
    .catch(error => {
      console.error(error);
      res.render('recipeNotFound');
    });
});




//---------------------------------------personal page------------------------------
app.get('/personal', (req, res) => {
  const username = req.session.username;
  const email = req.session.email || '';
  const dateOfBirth = req.session.dateOfBirth || ''; // Assuming the user's date of birth is stored in req.session.dateOfBirth
  res.render('personal', { username, email, dateOfBirth });
});



//---------------------------------------setting page------------------------------
app.get('/settings', (req, res) => {
  res.render('settings');
});

app.post('/settings', (req, res) => {
  const dateOfBirth = req.body.dateOfBirth; // Assuming the date of birth input field has the name "dateOfBirth"
  
  // Save the date of birth in the session or database for the current user
  req.session.dateOfBirth = dateOfBirth; // Storing it in the session for demonstration purposes
  
  res.redirect('/personal'); // Redirect back to the personal page after saving
});

app.get('/DOB', (req, res) => {
  res.render('DOB');
});




app.use(express.static(__dirname + "/public"));

app.get("*", (req, res) => {
  res.status(404);
  res.render("404", { title: "Page Not Found",navLinks,currentURL: url.parse(req.url).pathname});
});


app.listen(port, () => {
	console.log("Node application listening on port "+port);
}); 


async function checkRecipeIsFavourited(email, recipeId) {
  const query = {
    email: email,
    recipeId: recipeId
  };

  try {
    const favorite = await favourites.findOne(query);
    let val = 0;

    if (favorite) {
      val = 1;
      //console.log(val);
      return val;
    } else {
      //console.log(val);
      return val;
    }
  } catch (error) {
    console.error(error);
    return 0; // or throw the error if you want to handle it differently
  }
}






/**
 * Api Call Testing for recipe.ejs file
 * Please leave this at the bottom for now
 * */

/**
 * Spoonacular API spare key
 ** 3640854786784e75b2b4956ea4822dc5
 * 05adf25cf1be4acbaf7a00dc9265edf3 
 * 322b73e9c1964f1ca8f162c7f6a3456d
 * 80b86de0a010484a99e42715a36a8ab6 (Used for recipe page at the moment)
 * 7f3eb9302f924154be8533178d011761
 * 7427d37ed1324af7829fa87695c81c40 (Used on Home Page)
* bebbab558c1d470e802944e8d07ca845
* 53820c84e1cb476c90044eea130dbf6c
* 1bb15cce3c994921aaa86ea7d011cd20
*  e8c352e2ce2e47fb81599dc7db3d39ce
 * 39d5b85cc8dc417abc57dcfb0bb132b0
 */


 



 
