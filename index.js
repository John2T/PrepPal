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

const port = process.env.PORT || 8080;

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


app.get('/home', async (req, res) => {
  try {
    if (!req.session.loggedin) {
      // User is not logged in, redirect to home page
      res.redirect('/');
    } else {
      // Check if the session variable for recipe count exists, and initialize it if not
      if (!req.session.recipeCount) {
        req.session.recipeCount = 5;
      }

      // User is logged in
      var username = req.session.username;

      // Make an API request using axios
      const response = await axios.get('https://api.spoonacular.com/recipes/random', {
        params: {
          number: req.session.recipeCount, // Fetch the current recipe count
          tags: 'vegetarian,dessert',
          apiKey: '53820c84e1cb476c90044eea130dbf6c' // Replace with your actual Spoonacular API key
        }
      });

      console.log(response.data.recipes); // Check the structure of the API response

      const recipeData = response.data.recipes;
      res.render('home', { username, recipeData });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Internal Server Error');
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
      // Increment the recipe count by 5
      req.session.recipeCount += 5;
    }

    // Redirect back to the home page
    res.redirect('/home');
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Internal Server Error');
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

//-----------------------------------search page-----------------------------------
app.get('/search', async (req, res) => {
  if (!req.session.loggedin) {
    res.redirect('/');
  }
  try {
    const apiKey = "b9a29f4972e9477eba5e959e98248dbc";
    const numberOfIngredients = 10; // Number of ingredients to fetch
  
    const response = await axios.get('https://api.spoonacular.com/food/ingredients/search/apiKey=${}', {
      headers: {
        'Content-Type': 'application/json'
      },
      params: {
        query: '', // Leave it empty to fetch all ingredients
        number: numberOfIngredients,
        apiKey: apiKey // Include the apiKey as a query parameter
      }
    });
  
    const ingredients = response.data.results.map((result) => ({
      name: result.name,
      image: result.image
    }));

    console.log(ingredients);

    res.render('search', { list: ingredients }); // Pass the ingredients to your EJS template
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
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
  
  //Qoddi domain and url link send to user email
  const domain = 'http://rbqidcvhag.eu09.qoddiapp.com';
  const link = `${domain}/reset-password/${id}/${token}`;

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

  const htmlContent = `
  <p>Click on the following link to reset your password:</p>
  <a href="${link}">${link}</a>
`;

const info = await transporter.sendMail({
  from: 'PrepPal team <preppal36@gmail.com>',
  to: email,
  subject: `Reset Password for ${pwObj.name}`,
  html: htmlContent
});

  console.log(link);
  console.log("token 1:" + token);
});
//---------------------------------------------------------------------------------

//------------------------------------Reset passsword------------------------------
app.get('/reset-password/:id/:token', async(req, res, next) =>{
  const {id, token} = req.params;
  console.log
  
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
    console.log(error.message);
    res.send(error.message);
  }
  
  console.log(secret);
});

app.post('/reset-password/:id/:token', async (req, res, next) =>{
  const {id, token} = req.params;
  const {password, password2} = req.body;

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
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // update the user's password in the database
      const result = await userCollection.updateOne(
      { _id: ObjectId(id) },
      { $set: { password: hashedPassword } }
      );

      res.redirect('/login');

    } catch (error) {
      console.log(error.message);
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
    req.session.email = user.email;
    req.session.user = user;
    res.redirect('/home');
  } else {
    res.render('login', { errorMessage: 'User and password not found.'});
  }
});


app.get('/recipe/:id', (req, res) => {
  const recipeId = req.params.id;
  const api_key = "1bb15cce3c994921aaa86ea7d011cd20";
  const detailed_recipe = `https://api.spoonacular.com/recipes/${recipeId}/information?apiKey=${api_key}`;

  // Nested API call to get detailed recipe information
  fetch(detailed_recipe)
    .then(response => response.json())
    .then(data => {
      console.log(data);
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
              console.log(nutritionData);
              const nutrition = nutritionData;

              // Render the EJS template with the recipe data
              res.render('recipe', { recipe: details, ingredients: ingredients, instructions: instructions, details: details, nutrition: nutrition });
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



app.get('/personal', (req, res) => {
  const username = req.session.username;
  const email = req.session.email || '';
  const dateOfBirth = req.session.dateOfBirth || ''; // Assuming the user's date of birth is stored in req.session.dateOfBirth
  res.render('personal', { username, email, dateOfBirth });
});




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





/**
 * Api Call Testing for recipe.ejs file
 * Please leave this at the bottom for now
 * */

/**
 * Spoonacular API spare key
 * 3640854786784e75b2b4956ea4822dc5
 * 05adf25cf1be4acbaf7a00dc9265edf3 (No more calls May 11)
 */