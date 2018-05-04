//==============//
// npm Modules
//=============//

// Loads the environment variables from the .env file
// all info is in the .env file locally stored on github, same directory as the code

// loads the .env microsoft module to run the environment
require('dotenv-extended').load();

// loads an npm module to run azure bot framework
var builder = require('botbuilder');

// create the server for access from npm
var restify = require('restify');

// for the sentiment service from azure
var sentimentService = require('./cogServices/sentiment-service');

// create connection to the sql server using npm
var Connection = require('tedious').Connection;

// uses a variable request from sql
var Request = require('tedious').Request;


// https://www.npmjs.com/package/dateformat
// date and time noted
var dateFormat = require('dateformat');

// actual current state noted
var moment = require('moment');

// actual state noted
var mysql = require('mysql');

// short format for data and time
var dateFormatLite = require('date-format-lite');

// npm module for password encryption
var bcrypt = require('bcrypt');

// required to load the bot through Azure
var azure = require('botbuilder-azure'); 

//============//
// Bot Setup
//============//

// Setup restify Server
// sets up the server to handle the bot to manage it online
var server = restify.createServer();

// extracting the details from the 3978 by listening constantly to the port on the azure server
server.listen(process.env.port || process.env.PORT || 3978, function() {
	console.log('%s listening to %s', server.name, server.url);
});

// string used to connect to online LUIS model
var LUIS = "https://westus.api.cognitive.microsoft.com/luis/v2.0/apps/675bb37c-be1f-4d37-bede-a1125c9cbfaf?subscription-key=5e1fc6b899ad409484496712b2dd5418&verbose=true&timezoneOffset=0&q=";

// Serve a static web page
// creates a static server at the public/index.html as a web app ui
server.get(/.*/, restify.serveStatic({
	'directory': '.',
	'default': 'public/index.html'
}));

// ==============================//
// Connect to Azure SQL database
// ==============================//

// Create connection to database
// login information given to access the existing database
// please note the above will not allow you access to a database
//you need to set up your own sql database on azure using the qsl file on GitHub
var config =
	{
		userName: 'mng17',//'mng17@mhtbotdb',
		password: 'mhtestbotNOW!',//'1PlaneFifth',
		server: 'mhtbotdb.database.windows.net',//'mhtbotdb.database.windows.net',
		options:
			{
				database: 'mhtBotDB',//'mhtBotDB',
				encrypt: true,
			}
	}

var documentDbOptions = {
    host: 'https://mhtestbot2.documents.azure.com:443/',// Your-Azure-DocumentDB-URI
    masterKey: 'KXZzZQiuu4fioh48774GCseW1qFqSED3LfWe78dVux0rQab5SiLpgaN2hKoOLvl0ZZiadcKmtWKahrsFDDmx6w==', 
    database: 'botdocs',   
    collection: 'botdata'
};

// a new connection will be made to the database
var connection = new Connection(config);

// determines if the connect is in place, it will show error if not
connection.on('connect', function(err)
	{
		if(err){
			console.log(err)
		}else{
			//queryDatabase()
			console.log("Connection successful");
		}
	}
);

// connection setup to Azure Cosmos DB
var docDbClient = new azure.DocumentDbClient(documentDbOptions);
var cosmosStorage = new azure.AzureBotStorage({ gzipData: false }, docDbClient);

// Table storage (if used rather than CosmosDB)
//var tableName = "Table-Name"; // You define
//var storageName = "Table-Storage-Name"; // Obtain from Azure Portal
//var storageKey = "Azure-Table-Key"; // Obtain from Azure Portal

// ===============
// Create chat bot
// ===============

// Create connector and listen for messages
// looking for the env file and extracting the ID and password from azure
var connector = new builder.ChatConnector({
	appId: process.env.MICROSOFT_APP_ID,
	appPassword: process.env.MICROSOFT_APP_PASSWORD
});

// this builds the bot, and checks for any previous session details, 
// if a previous session has stored the username then, that username wiil be used 
// if a username has not been stored (null) then the user is just greeted
var bot = new builder.UniversalBot(connector, [
	function(session){
		console.log(session.userData.username);
		if(session.userData.username == null){
			session.send('Hello!');
			session.beginDialog('greeting');
		}else{
			session.send("Hi " + session.userData.username + "!");
			session.beginDialog('generalQs');
			//session.beginDialog('phq9'); /* for testing */
		}
	}
])
.set('storage', cosmosStorage);

// listens to messages from the server
server.post('/api/messages', connector.listen());

//============
// Constants
//============

// bcrypt hashing key used to store passwords securely in the database
const saltRounds = 10;

//===================
// Global Variables
//===================

// initialises GAD / PHQ9 score from start
var totalScore = 0;

// initialise questionas 0 from start
var questionID = 0;

// initialise emotional stats of the user
var feeling = null;


// required for time
// keeps track of time between messages
var local = false;

// initialise questionas 0 from start in milliseconds between messages e.g. 1 second
var delayTime = 1000;

//=============
// Bot Dialogs
//=============

//-----------------------------//
// Logout Dialog - for testing
//-----------------------------//

// function for logging out but it is not used to enable the user name to be saved for the session 
// the username is saved after a session for convenience when logging in
// the userdata is set to null
bot.dialog('logout', [
	function(session, args, next){
		session.userData.userID = null;
		session.userData.username = null;
		session.userData.questionnaireID = null;
		session.delay(delayTime);
		session.endConversation("You are now logged out. Just come back and say hello when you'd like to speak again :)");
	}
]).triggerAction({
	matches: /^logout$/i
});


//------------------//
// Greeting Dialog
//------------------//

// the user is asked to either login or register based on whether they have an account yet
bot.dialog('greeting', [
	function(session, args, next){
        // the bot will appear as typing to the user
		session.sendTyping();
        // a delay is given to offer the illusion that the bot had been typing up its response
		session.delay(delayTime);
		builder.Prompts.confirm(session, "Are you already registered?");
	},
	function(session, results){
		session.sendTyping();
		session.delay(delayTime);
        // the user's response is saved
		var userResponse = results.response;
        // depeding on whether the user says yes or no they'll be directed to the right area
		if(userResponse == true){
			session.endDialog('Great, let\'s log you in');
            // the login dialog is ran
			session.beginDialog('login');
		}else{
			session.send('No problem. Registering is quick and easy');
            // a boolean variable is used to store whether a username is valid 
			session.userData.usernameValid = true;
            // the register dialog is ran
			session.beginDialog('register');
		}
	}
]);

//------------------//
// Register Dialog
//------------------//

//  if the person is not registerd it adds them to the database
bot.dialog('register', [
	function(session, args, next){
		session.sendTyping();
		session.delay(delayTime);
		if(session.userData.usernameValid == true){
			builder.Prompts.text(session, "Please enter a username of your choice.");
		}else{
            // the user will be asked to pick another is they have enetered an invalid username
			builder.Prompts.text(session, "Please pick another username.");
		}
	},
	function(session, result, next){
		session.userData.username = result.response;
		console.log("Username entered was: " + session.userData.username);

		// Checks for illegal characters in entered username
		var checkSpaces = session.userData.username.includes(" ");
		console.log("Username entered included spaces: " + checkSpaces);

		var checkSingleQuotationMarks = session.userData.username.includes("'");
		console.log("Username entered included inverted commas: " + checkSingleQuotationMarks);

		// Handles username with illegal characters
		if(checkSpaces == true || checkSingleQuotationMarks == true){
			session.sendTyping();
			session.delay(delayTime);
			session.send("I'm sorry, usernames cannot have spaces or single quotation marks (') in them.");
			session.userData.usernameValid = false;
			session.beginDialog('register');
		}

		// Checks whether username already exists in the Users table
		request = new Request(
			"SELECT UserID FROM Users WHERE Username = " + mysql.escape(session.userData.username), function(err, rowCount, rows){
				console.log("In query for Username");
				if(!err){
					console.log("Query on user table successfully executed"); // without any error
					console.log(rowCount + " rows returned");
                    // if a row has been identified as having the username, then it cannot be used and rowcount>0
					if(rowCount>0){
						console.log("Username " + session.userData.username + " already exists in database");
						session.sendTyping();
						session.delay(delayTime);
                        // the user is told that the username is unavailable
                        // the register process is begun again
						session.send("I'm sorry, that username is unavailable");
						session.userData.usernameValid = false;
						session.beginDialog('register');
					}else{
                        // if rowcount<1 then the username has not been taken
						console.log("Username " + session.userData.username + " does not already exist");
						next();
					}
				}else{
					console.log("An error occurred in checking whether the user exists in the database." + err);
				}
			}
		);
        // the sql request above is made on the database
		connection.execSql(request);
	}, 
	function(session, result){
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, "Thanks. Please enter a password of your choice.");
	},
	function(session, result){
        // the password they've inputted is saved 
		var plainTextPassword = result.response;

        // the bcrypt module is used to hash the plain text user inputted password for security
        // the constant saltRound is used as the hash key
		bcrypt.genSalt(saltRounds, function(err, salt){
			bcrypt.hash(plainTextPassword, salt, function(err, hash){
				console.log(hash);
                // a new request is made to add both the new username and hashed password into the database
				request = new Request(
					"INSERT INTO Users (Username, Password) VALUES (" + mysql.escape(session.userData.username) + "," + mysql.escape(hash) + "); SELECT @@identity" + "",
						function(err, rowCount, rows){
							if(!err){
								console.log("User successfully inserted into table");
								session.sendTyping();
								session.delay(delayTime);
								session.send("Welcome " + session.userData.username + "! You've successfully registered.");
                                // after succesful registration the generalqs dialog are asked
								session.beginDialog('generalQs');
							}else{
								console.log("Error" + err);
							}

						}
				);
                // the user id next to the username in the table is logged
				request.on('row', function(columns){
					console.log('Newly registered user id is: %d', columns[0].value);
					session.userData.userID = columns[0].value;
				});
                // the above request is executed
				connection.execSql(request);
			});
		});
	}, 
]);



//------------------//
// Login Dialog
//------------------//

// the above deals with login queries in SQL
bot.dialog('login', [
	function(session){
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, "Please enter your username:");
	},
	function(session,results, next){
        // user response saved as the password
		session.userData.username = results.response;
		console.log("Username entered was " + session.userData.username);

        // a new request to find a matching field with username 
		request = new Request(
			"SELECT UserID FROM Users WHERE Username = " + mysql.escape(session.userData.username), function(err, rowCount, rows){
				console.log("In query for Username");
				if(!err){
					console.log("Query to check if username exists successfully executed");
					console.log(rowCount + " rows returned");
                    //if a row exists with the username on it (rowcount>0)
					if(rowCount>0){
						console.log("Username " + session.userData.username + " exists.");
						next();
					}else{
                        // the case where the username is not in the database
						console.log("Username " + session.userData.username + " does not exist");
						session.sendTyping();
						session.delay(delayTime);
						session.send("I'm sorry, I don't recognise that username. Please try logging in again.");
						session.beginDialog('login');
					}
				}else{
					console.log("An error occurred in checking whether this username exists." + err);
					//session.endDialog("User does not exist on system");
				}
			}
		);
		connection.execSql(request);
	},
	function(session){
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, "Thanks. Now please enter your password.");
	},
	function(session, result){
		session.userData.password = result.response;
		var plainTextPassword = session.userData.password;

		request = new Request(
			"SELECT UserID, Password FROM Users WHERE Username =" +  mysql.escape(session.userData.username),
				function(err, rowCount, rows){
					if(!err){
						console.log("Query to retrieve UserID and Password from db successful.");
						console.log(rowCount + " rows returned.");
						if(rowCount>0){
							console.log("UserID and Password successfully retrieved from database");
						}else{
							console.log("No userID and password retrieved. This should not happen.");
						}
					}else{
						console.log("Error in retrieving UserID and Password from database: " + err);
				}
			}
		);

		request.on('row', function(columns){
			console.log("Logged in user userID is: " + columns[0].value);
			console.log("Password from db is: " + columns[1].value);
            
            // the stored hashed password is saved as a variable
			var hash = columns[1].value;
			
            // the entered password is hashed and compared to the one in the database
            // the npm module bcrypt is used to do this 
			bcrypt.compare(plainTextPassword, hash, function(err, res){
				if(res === true){
					console.log("Password entered matches password stored in database");

					session.userData.password = columns[1].value;
					session.userData.userID = columns[0].value;

					console.log("User %s logged in.", session.userData.username);
					session.sendTyping();
					session.delay(delayTime);
					session.endDialog("Wecome back %s!", session.userData.username);
					session.beginDialog('generalQs');
					//session.beginDialog('gad7');  for testing 
				}else{
					console.log("Passwords do not match");
					session.sendTyping();
					session.delay(delayTime);
					session.send("I'm sorry, your password is incorrect. Please try logging in again");
                    // if the password is inncorect the login dialog is run through again
					session.beginDialog('login');
				}
			});
		});
		connection.execSql(request);
	}
]);


//------------------//
//GeneralQs Dialog
//------------------//

bot.dialog('generalQs', [
	function(session, args, next){
		beginNewQuestionnaire(session, session.userData.userID, 'generalQs')
		session.userData.lastMessageSent = new Date();
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, 'How are you?');
		// starts the bot session after the greetings
	},
	function(session, results, next){ 
		session.userData.lastMessageReceived = new Date();
		session.conversationData.userResponse = results.response;
		questionID = 1;
		// loging the session asks question 1

		recogniseFeeling(session.message.text)
			.then(function(feelingEntity){ 
				session.delay(delayTime);
				var botResponse = generateBotGeneralQResponse(feelingEntity);
				processGeneralQResponse(session, session.conversationData.userResponse, questionID, session.userData.questionnaireID);
				if(feeling == 'Happy'){
					session.sendTyping();
					session.delay(delayTime);
					session.send(botResponse);
					session.sendTyping();
					session.delay(delayTime);
					session.endConversation("I'll say goodbye for now " + session.userData.username + " but just say hello when you'd like to speak again :)");

					// if happy it says it ends the question process

				}else{
					session.sendTyping();
					session.delay(delayTime);
					session.send(botResponse + ".");
					next();
				}
			})
			.catch(function(error){
				processGeneralQResponse(session, session.conversationData.userResponse, questionID, session.userData.questionnaireID);
				console.log("No feeling identified" + error);
				session.beginDialog('clarifyFeeling');
			});
			// if no emotion seen it will go to code below called calrify feeling

	},
	function(session, args, next){
		// https://stackoverflow.com/questions/42069081/get-duration-between-the-bot-sending-the-message-and-user-replying 6WTF
		session.userData.lastMessageSent = new Date();
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, 'What has led you to seek an assessment for how you\'re feeling?');
	}, 
	// the first open question (re question 3)

	function(session, results, next){
		questionID = 3;
		session.userData.lastMessageReceived = new Date();
		session.conversationData.userResponse = results.response;
		processGeneralQResponse(session, results.response, questionID, session.userData.questionnaireID);
		session.sendTyping();
		session.delay(delayTime);
		session.send(generateBotGeneralQResponse2());
		next();
	},
	function(session){
		session.userData.lastMessageSent = new Date();
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, 'Can you identify anything in particular that might have triggered any negative thoughts and feelings?');
		// question open two (ref question 4)
	},
	function(session, results, next){
		questionID = 4;
		session.userData.lastMessageReceived = new Date();
		session.conversationData.userResponse = results.response;
		// logs the response
		processGeneralQResponse(session, session.conversationData.userResponse, questionID, session.userData.questionnaireID);
		session.sendTyping();
		session.delay(delayTime);
		session.send(generateBotGeneralQResponse2());
		next();

		// logs question 4
	},
	function(session){
		session.userData.lastMessageSent = new Date();
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, 'What have these thoughts and feelings stopped you doing?');

		// as the third open question (ref question 5)
	},
	function(session, results, next){
		questionID = 5;
		session.userData.lastMessageReceived = new Date();
		session.conversationData.userResponse = results.response;
		// logs the response
		processGeneralQResponse(session, session.conversationData.userResponse, questionID, session.userData.questionnaireID);
		session.sendTyping();
		session.delay(delayTime);
		session.send(generateBotGeneralQResponse2());
		next();
		// logs question 5
	},
	function(session){
		session.userData.lastMessageSent = new Date();
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.confirm(session, 'Do you have a care plan? If you don\'t know what a care plan is, please answer \'No\'.');
	},
	function(session, results, next){
		var userResponse = results.response;
		questionID = 6;
		session.userData.lastMessageReceived = new Date();
		processGeneralQResponse(session, session.message.text, questionID, session.userData.questionnaireID);
		session.sendTyping();
		session.delay(delayTime);
		session.send(generateBotGeneralQResponse2());
        // depending on if the user has said yes, they will be asked if their care plan is working 
		if(userResponse == true){
			session.userData.lastMessageSent = new Date();
			session.sendTyping();
			session.delay(delayTime);
			builder.Prompts.text(session, 'Is it working for you?');
		}else{
			next();
		}
	},
	function(session, results, next){
		questionID = 7;
		session.userData.lastMessageReceived = new Date();
		processGeneralQResponse(session, session.message.text, questionID, session.userData.questionnaireID);
		session.sendTyping();
		session.delay(delayTime);
		session.send("Thank you for answering these questions " + session.userData.username + ".");
		next();
	},
    // if the feeling is noted as depressed in any way then the PHQ9 dialog is begun
    // if the feeling is noted as just anxious then the GAD7 dialog is begun
	function(session){
		if(feeling == 'Depressed' || feeling == 'DepressedAndAnxious'){
			session.beginDialog('phq9');
		}else{
			session.beginDialog('gad7');
		}
	}
]);

//-----------------------//
// clarifyFeeling Dialog
//----------------------//

// this dialog will clarify any feelings that the bot needs to interpret
bot.dialog('clarifyFeeling', [
	function(session){
		console.log("Beginning 'clarifyFeeling' dialog");
		session.userData.lastMessageSent = new Date();
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, "Apologies I didn't catch that, would you be able to be able to tell me if you're mostly feeling low, or anxious, or happy?");
	},
	function(session, results, next){
		session.conversationData.userResponse = results.response;
        
        // recognise feeling will extract which feeling the user has entered using LUIS
		recogniseFeeling(session.message.text)
			.then(function(feelingEntity){ 
                // the bot will make a response based on the user's feeling 
				var botResponse = generateBotGeneralQResponse(feelingEntity);
				console.log(feelingEntity);
				console.log("Bot response is:");
				console.log(botResponse);
                // if the user is hapy then there is no need to ask any questions 
				if(feelingEntity == 'Happy'){
					session.sendTyping();
					session.delay(delayTime);
					session.send(botResponse);
					session.sendTyping();
					session.delay(delayTime);
					session.endConversation("I'll say goodbye for now " + session.userData.username + " but just say hello when you'd like to speak again :)");
				}else{
                    // if the user is not happy then then more questions will be asked
					session.sendTyping();
					session.delay(delayTime);
					session.send("Thank you for telling me this. " + botResponse + " though.");
					next();
				}
			})
			.catch(function(error){ 
                // if the LUIS model couldn't extract any entities, then the feeeling needs to be clarified again
				console.log("No entities identified" + error);
                // the clarify feeling dialog is run again
				session.beginDialog('clarifyFeeling');
			});
	},
	function(session, results, next){
		questionID = 2;
		session.userData.lastMessageReceived = new Date();
		processGeneralQResponse(session, session.conversationData.userResponse, questionID, session.userData.questionnaireID)
		next();
	},
	function(session){
		session.endDialog();
	}
]);

//---------------------------//
// clarify Difficulty Dialog //
//---------------------------//

//in the case where the LUIS cannot extract the level of difficulty, the user is asked again
bot.dialog('clarifyDifficulty', [
	function(session){
		console.log("Beginning 'clarifyDifficult' dialog");
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, "I'm sorry, I didn't quite get that. Would you say these problems have made these areas of your life: somewhat difficult, very difficult, extremely difficult, or not difficult at all?");
	},
	function(session, results, next){
        // recognise difficulty will extract which feeling the user has entered using LUIS
		recogniseDifficultyEntity(session.message.text)
			.then(function(entity){ 
				var botResponse = generateBotQuestionnaireResponse(entity);
				session.conversationData.userResponse = results.response;
				session.sendTyping();
				session.delay(delayTime);
				session.send("Thank you.");
				next();
			})
			.catch(function(error){ 
                // if the LUIS model couldn't extract any entities, then the difficulty needs to be clarified again
				console.log("No entities identified " + error);
                // the clarify difficulty dialog is run again
				session.beginDialog('clarifyDifficulty');
			});
	},
	function(session){
		session.endDialog();
	}
]);

//--------------------//
// clarifyDays Dialog //
//--------------------//
//in the case where the LUIS cannot extract the number of days, the user is asked again
bot.dialog('clarifyDays', [
	function(session){
		console.log("Beginning 'clarifyDays' dialog");
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, "I'm sorry, I didn't quite get that. Please try and give a specific number of days.");
	},
	function(session, results, next){
        // recognise day will extract the number of days the user has entered using LUIS
		recogniseDayEntity(session.message.text)
			.then(function(entity){ 
				var botResponse = generateBotQuestionnaireResponse(entity);
				session.conversationData.userResponse = results.response;
				session.sendTyping();
				session.delay(delayTime);
				session.send("Thank you");
				next();
			})
			.catch(function(error){ 
                // if the LUIS model couldn't extract any entities, then the number of days needs to be clarified again
				console.log("No entities identified" + error);
				session.beginDialog('clarifyDays');
			});
	},
	function(session){
		session.endDialog();
	}
]);

//------------------------//
// clarifyActivity Dialog //
//------------------------//
//in the case where the LUIS cannot extract whether the activity impacts the user or not, the user is asked again

bot.dialog('clarifyActivity', [
	function(session){
		console.log("Beginning 'clarifyActivity' dialog");
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, "I'm sorry, I didn't quite get that. Would you say that how you feel is related to it? (Of course/Not quite)");
	},
	function(session, results, next){
        // recognise acitivity will extract which feeling the user has entered using LUIS
		recogniseActivityEntity(session.message.text)
			.then(function(entity){ 
				var botResponse = generateBotActivityResponse(entity);
				session.conversationData.userResponse = results.response;
				session.sendTyping();
				session.delay(delayTime);
				session.send("Thank you for letting me know.");
				next();
			})
			.catch(function(error){ 
                // if the LUIS model couldn't extract any entities, then the difficulty needs to be clarified again
				console.log("No entities identified " + error);
                // the clarify difficulty dialog is run again
				session.beginDialog('clarifyActivity');
			});
	},
	function(session){
		session.endDialog();
	}
]);







//------------------//
// phq9 Dialog
//------------------//

// the dialog questions listed in the PHQ9 questionnaire are asked
bot.dialog('phq9', [
    // firstly the user is asked if they want to go through the clinical process or not
	function (session, args, next){
		console.log('Beginning phq9 dialog');
		totalScore = 0;
		session.sendTyping();
		session.delay(delayTime);
        session.send("I'm now going to ask you some questions about how you've felt over the past two weeks");
		builder.Prompts.confirm(session, "I will be taking you through a clinical process that will help you to explain how you feel to a clinician. Is that ok?");
		
	},
	function(session, results, next){
		var userResponse = results.response;
		if(userResponse == true){
			session.sendTyping();
			session.delay(delayTime);
			session.send("Great!");
			next();
		}else{
			session.delay(delayTime);
			session.endDialog("No problem!" + session.userData.username + "Come back when you feel ready to try this.");
		}
	}, 
    // PHQ9 questionnaire begins 
	function(session){
		beginNewQuestionnaire(session, session.userData.userID, 'phq9');
		session.userData.lastMessageSent = new Date();
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, "In the past two weeks, how many days have you had little interest or pleasure in doing things?");
	}, 
	function(session, results, next){ 
		//session.dialogData.userResponse = results.response;
        // recognise day entity uses LUIS to extract the number of days 
		recogniseDayEntity(results.response)
			.then(function(entity){ 
                // depending on what the user has said botResponse will work out what to say 
				var botResponse = generateBotQuestionnaireResponse(entity);
				session.delay(delayTime);
				session.sendTyping();
				session.send(botResponse);
				session.conversationData.userResponse = results.response;
				next();
			})
			.catch(function(error){ 
                // when LUIS cannot extract any entities from the input, clarify days is begun 
				console.log("No entities identified" + error);
				session.beginDialog('clarifyDays');
			});
	},
	function(session, results, next){
		questionID = 8;
		session.userData.lastMessageReceived = new Date();
		console.log("Current questionnaireID is: " + session.userData.questionnaireID);
		session.delay(delayTime);
		processQuestionnaireResponse(session, session.conversationData.userResponse, 'phq9', questionID, session.userData.questionnaireID);
		next();
	}, 
    //next q
	function(session, next){
		console.log("phq9 q2");
		session.userData.lastMessageSent = new Date();
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, "In the past two weeks, how many days have you felt down, depressed, or hopeless?");
	},
	function(session, results, next){ 
		session.dialogData.userResponse = results.response;
		recogniseDayEntity(session.message.text)
			.then(function(entity){ 
				var botResponse = generateBotQuestionnaireResponse(entity);
				session.sendTyping();
				session.delay(delayTime);
				session.send(botResponse);
				session.conversationData.userResponse = results.response;
				next();
			})
			.catch(function(error){ 
				console.log("No entities identified" + error);
				session.beginDialog('clarifyDays');
			});
	},
	function(session, results, next){ 
		questionID += 1;
		session.userData.lastMessageReceived = new Date();
		processQuestionnaireResponse(session, session.conversationData.userResponse, 'phq9', questionID, session.userData.questionnaireID);
		next();
	},
	function(session, next){
		session.userData.lastMessageSent = new Date();
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, 'In the past two weeks, how many days have you had trouble falling or staying asleep, or sleeping too much?');
	},
	function(session, results, next){ 
		session.dialogData.userResponse = results.response;
		recogniseDayEntity(session.message.text)
			.then(function(entity){ 
				var botResponse = generateBotQuestionnaireResponse(entity);
				session.sendTyping();
				session.delay(delayTime);
				session.send(botResponse);
				session.conversationData.userResponse = results.response;
				next();
			})
			.catch(function(error){ 
				console.log("No entities identified" + error);
				session.beginDialog('clarifyDays');
			});
	},
	function(session, results, next){ 
		questionID += 1;
		session.userData.lastMessageReceived = new Date();
		processQuestionnaireResponse(session, session.conversationData.userResponse, 'phq9', questionID, session.userData.questionnaireID);
		next();
	},
	function(session, next){
		session.userData.lastMessageSent = new Date();
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, "In the past two weeks, how many days were you bothered by feeling tired or having little energy?");
	},
	function(session, results, next){ 
		session.dialogData.userResponse = results.response;
		recogniseDayEntity(session.message.text)
			.then(function(entity){ 
				var botResponse = generateBotQuestionnaireResponse(entity);
				session.sendTyping();
				session.delay(delayTime);
				session.send(botResponse);
				session.conversationData.userResponse = results.response;
				next();
			})
			.catch(function(error){ 
				console.log("No entities identified" + error);
				session.beginDialog('clarifyDays');
			});
	},
	function(session, results, next){ 
		questionID += 1;
		session.userData.lastMessageReceived = new Date();
		processQuestionnaireResponse(session, session.conversationData.userResponse, 'phq9', questionID, session.userData.questionnaireID);
		next();
	},
	function(session, next){
		session.userData.lastMessageSent = new Date();
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, "In the past two weeks, how many days have you had a poor appetite or overeaten?");
	}, 
	function(session, results, next){ 
		session.dialogData.userResponse = results.response;
		recogniseDayEntity(session.message.text)
			.then(function(entity){ 
				var botResponse = generateBotQuestionnaireResponse(entity);
				session.sendTyping();
				session.delay(delayTime);
				session.send(botResponse);
				session.conversationData.userResponse = results.response;
				next();
			})
			.catch(function(error){ 
				console.log("No entities identified" + error);
				session.beginDialog('clarifyDays');
			});
	},
	function(session, results, next){ 
		questionID += 1;
		session.userData.lastMessageReceived = new Date();
		processQuestionnaireResponse(session, session.conversationData.userResponse, 'phq9', questionID, session.userData.questionnaireID);
		next();
	},
	function(session, next){
		session.userData.lastMessageSent = new Date();
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, "In the past two weeks, how many days have you felt bad about yourself - or that you are a failure or have let yourself or your family down?");
	}, 
	function(session, results, next){ 
		session.dialogData.userResponse = results.response;
		recogniseDayEntity(session.message.text)
			.then(function(entity){ 
				var botResponse = generateBotQuestionnaireResponse(entity);
				session.sendTyping();
				session.delay(delayTime);
				session.send(botResponse);
				session.conversationData.userResponse = results.response;
				next();
			})
			.catch(function(error){ 
				console.log("No entities identified" + error);
				session.beginDialog('clarifyDays');
			});
	},
	function(session, results, next){ 
		questionID += 1;
		session.userData.lastMessageReceived = new Date();
		processQuestionnaireResponse(session, session.conversationData.userResponse, 'phq9', questionID, session.userData.questionnaireID);
		next();
	},
	function(session, next){
		session.userData.lastMessageSent = new Date();
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, "In the past two weeks, how many days have you had trouble concentrating on things, such as reading the newspaper or watching television?");
	}, 
	function(session, results, next){ 
		session.dialogData.userResponse = results.response;
		recogniseDayEntity(session.message.text)
			.then(function(entity){ 
				var botResponse = generateBotQuestionnaireResponse(entity);
				session.sendTyping();
				session.delay(delayTime);
				session.send(botResponse);
				session.conversationData.userResponse = results.response;
				next();
			})
			.catch(function(error){ 
				console.log("No entities identified" + error);
				session.beginDialog('clarifyDays');
			});
	},
	function(session, results, next){ 
		questionID += 1;
		session.userData.lastMessageReceived = new Date();
		processQuestionnaireResponse(session, session.conversationData.userResponse, 'phq9', questionID, session.userData.questionnaireID);
		next();
	},
	function(session, next){
		session.userData.lastMessageSent = new Date();
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, "In the past two weeks, how many days have you moved or spoken so slowly that other people could have noticed? Or the opposite - been so fidgety or restless that you've been moving around a lot more than usual?");
	}, 
	function(session, results, next){ 
		session.dialogData.userResponse = results.response;
		recogniseDayEntity(session.message.text)
			.then(function(entity){ 
				var botResponse = generateBotQuestionnaireResponse(entity);
				session.sendTyping();
				session.delay(delayTime);
				session.send(botResponse);
				session.conversationData.userResponse = results.response;
				next();
			})
			.catch(function(error){ 
				console.log("No entities identified" + error);
				session.beginDialog('clarifyDays');
			});
	},
	function(session, results, next){ 
		questionID += 1;
		session.userData.lastMessageReceived = new Date();
		processQuestionnaireResponse(session, session.conversationData.userResponse, 'phq9', questionID, session.userData.questionnaireID);
		next();
	},

	function(session, next){
		session.userData.lastMessageSent = new Date();
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, "In the past two weeks, how many days have you had thoughts that you'd be better off dead or of hurting yourself in some way?");
	},
	function(session, results, next){ 
		session.dialogData.userResponse = results.response;
		recogniseDayEntity(session.message.text)
			.then(function(entity){ 
				var botResponse = generateBotQuestionnaireResponse(entity);
				session.sendTyping();
				session.delay(delayTime);
				session.send(botResponse);
				session.conversationData.userResponse = results.response;
				next();
			})
			.catch(function(error){ 
				console.log("No entities identified" + error);
				session.beginDialog('clarifyDays');
			});
	},
	function(session, results, next){ 
		questionID += 1;
		session.userData.lastMessageReceived = new Date();
		processQuestionnaireResponse(session, session.conversationData.userResponse, 'phq9', questionID, session.userData.questionnaireID);
		next();
	},
	function(session, next){
		session.userData.lastMessageSent = new Date();
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, "How difficult have any of these problems made it for you to do your work, take care of things at home, or get along with other people?");
	},
	function(session, results, next){ 
		session.dialogData.userResponse = results.response;
		recogniseDifficultyEntity(session.message.text)
			.then(function(entity){ 
				session.conversationData.userResponse = results.response;
				next();
			})
			.catch(function(error){ 
				console.log("No entities identified" + error);
				session.beginDialog('clarifyDifficulty');
			});
	},
	function(session, results, next){
		questionID += 1;
		session.userData.lastMessageReceived = new Date();
		processDifficultyResponse(session, session.conversationData.userResponse, 'phq9', questionID, session.userData.questionnaireID);
		next();
	},
	function(session, results, next){
		var severity = getSeverity(totalScore);
		console.log("The user's score of %i indicates that the user has %s depression", totalScore, severity);
		session.sendTyping();
		session.delay(delayTime);
		session.send('Thank you for answering these questions ' + session.userData.username + '. You\'ve just been through the PHQ-9 questionnaire. Your score is %i, which will be useful for a clinician. Please do this questionnaire regularly and, if after two weeks you don\'t feel any better, please share your score and your responses with a clinician. Your data is available at the [MhtBot:Data](http://mhtbotdbaccess.azurewebsites.net) site.', totalScore);
		next();
	},
	function(session){
		if(feeling == 'Depressed'){
			session.sendTyping();
			session.delay(delayTime);
			session.endConversation("I'll say goodbye for now " + session.userData.username + ". Just come back and say hello when you'd like to chat again :)");
		}else if(feeling == 'DepressedAndAnxious'){
            // if the user is also feeling anxious then the GAD7 is asked next 
			session.beginDialog('gad7');
		}
	},
]);

//------------------//
// gad7 Dialog
//------------------//
bot.dialog('gad7', [
    // user is asked if they want to carry out this questionnaire or not 
	function (session, args, next){
		console.log('Beginning gad7 dialog');
		totalScore = 0;
		session.sendTyping();
		session.delay(delayTime);
		if(feeling == 'Anxious'){
			builder.Prompts.confirm(session, "I'm now going to take you through a clinical process that will help you to explain how you feel to a clinician. Is that ok?");
		}else{
			builder.Prompts.confirm(session, "There's another clinical process that could also help you. Would you like to do this one as well?");
		}
	},
	function(session, results, next){
		var userResponse = results.response;
		session.sendTyping();
		session.delay(delayTime);
		if(userResponse == true){
			session.send("That's great!");
			next();
		}else{
			session.endConversation("No problem, just come back and say hello when you feel ready to try this. Hope to speak to you again soon " + session.userData.username + "!");
		}
	},
    // 1st question
	function(session){
		beginNewQuestionnaire(session, session.userData.userID, 'gad7');
		session.userData.lastMessageSent = new Date();
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, "In the past two weeks, how many days have you felt nervous, anxious, or on edge?");
	}, 
	function(session, results, next){ 

		recogniseDayEntity(session.message.text)
			.then(function(entity){ 
				var botResponse = generateBotQuestionnaireResponse(entity);
				session.sendTyping();
				session.delay(delayTime);
				session.send(botResponse);
				session.conversationData.userResponse = results.response;
				next();
			})
			.catch(function(error){ 
				console.log("No entities identified" + error);
				session.beginDialog('clarifyDays');
			});
	},
	function(session, results, next){ 
		questionID = 18;
		console.log("questionnaire ID identified is");
		console.log(session.userData.questionnaireID);
		session.userData.lastMessageReceived = new Date();
		processQuestionnaireResponse(session, session.conversationData.userResponse, 'gad7', questionID, session.userData.questionnaireID);
		next();
	},
    //next question
	function(session){
		session.userData.lastMessageSent = new Date();
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, "In the past two weeks, how many days have you not been able to stop or control worrying?");
	}, 
	function(session, results, next){ 
		session.dialogData.userResponse = results.response;
		recogniseDayEntity(session.message.text)
			.then(function(entity){ var botResponse = generateBotQuestionnaireResponse(entity);
				session.sendTyping();
				session.delay(delayTime);
				session.send(botResponse);
				session.conversationData.userResponse = results.response;
				next(); })
			.catch(function(error){ console.log("No entities identified" + error);
				session.beginDialog('clarifyDays'); });
	},
	function(session, results, next){ 
		questionID += 1;
		session.userData.lastMessageReceived = new Date();
		processQuestionnaireResponse(session, session.conversationData.userResponse, 'gad7', questionID, session.userData.questionnaireID);
		next();
	},
    // next question
	function(session){
		session.userData.lastMessageSent = new Date();
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, "In the past two weeks, how many days have you worried too much about different things?");
	}, 
	function(session, results, next){ 
		session.dialogData.userResponse = results.response;
		recogniseDayEntity(session.message.text)
			.then(function(entity){ 
				var botResponse = generateBotQuestionnaireResponse(entity);
				session.conversationData.userResponse = results.response;
				session.sendTyping();
				session.delay(delayTime);
				session.send(botResponse);
				next(); })
			.catch(function(error){ console.log("No entities identified" + error);
				session.beginDialog('clarifyDays'); });
	},
	function(session, results, next){ 
		questionID += 1;
		session.userData.lastMessageReceived = new Date();
		processQuestionnaireResponse(session, session.conversationData.userResponse, 'gad7', questionID, session.userData.questionnaireID);
		next();
	},
    // next question
	function(session){
		session.userData.lastMessageSent = new Date();
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, "In the past two weeks, how many days have you had trouble relaxing?");
	}, 
	function(session, results, next){ 
		session.dialogData.userResponse = results.response;
		recogniseDayEntity(session.message.text)
			.then(function(entity){
				var botResponse = generateBotQuestionnaireResponse(entity);
				session.sendTyping();
				session.delay(delayTime);
				session.send(botResponse);
				session.conversationData.userResponse = results.response;
				next(); })
			.catch(function(error){ console.log("No entities identified" + error);
				session.beginDialog('clarifyDays'); });
	},
	function(session, results, next){ 
		questionID += 1;
		session.userData.lastMessageReceived = new Date();
		processQuestionnaireResponse(session, session.conversationData.userResponse, 'gad7', questionID, session.userData.questionnaireID);
		next();
	},
    // next question
	function(session){
		session.userData.lastMessageSent = new Date();
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, "In the past two weeks, how many days have you been so restless that it's been hard to sit still?");
	}, 
	function(session, results, next){ 
		session.dialogData.userResponse = results.response;
		recogniseDayEntity(session.message.text)
			.then(function(entity){ 
				var botResponse = generateBotQuestionnaireResponse(entity);
				session.sendTyping();
				session.delay(delayTime);
				session.send(botResponse);
				session.conversationData.userResponse = results.response;
				next(); })
			.catch(function(error){ console.log("No entities identified" + error);
				session.beginDialog('clarifyDays'); });
	},
	function(session, results, next){ 
		questionID += 1;
		session.userData.lastMessageReceived = new Date();
		processQuestionnaireResponse(session, session.conversationData.userResponse, 'gad7', questionID, session.userData.questionnaireID);
		next();
	},
    //next question
	function(session){
		session.userData.lastMessageSent = new Date();
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, "In the past two weeks, how many days have you become easily annoyed or irritable?");
	}, 
	function(session, results, next){ 
		session.dialogData.userResponse = results.response;
		recogniseDayEntity(session.message.text)
			.then(function(entity){ 
				var botResponse = generateBotQuestionnaireResponse(entity);
				session.sendTyping();
				session.delay(delayTime);
				session.send(botResponse);
				session.conversationData.userResponse = results.response;
				next(); })
			.catch(function(error){ console.log("No entities identified" + error);
				session.beginDialog('clarifyDays'); });
	},
	function(session, results, next){ 
		questionID += 1;
		session.userData.lastMessageReceived = new Date();
		processQuestionnaireResponse(session, session.conversationData.userResponse, 'gad7', questionID, session.userData.questionnaireID);
		next();
	},
    //nect question
	function(session){
		session.userData.lastMessageSent = new Date();
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, "In the past two weeks, how many days have you felt afraid, as if something awful might happen?");
	}, 
	function(session, results, next){ 
		session.dialogData.userResponse = results.response;
		recogniseDayEntity(session.message.text)
			.then(function(entity){ 
				var botResponse = generateBotQuestionnaireResponse(entity);
				session.sendTyping();
				session.delay(delayTime);
				session.send(botResponse);
				session.conversationData.userResponse = results.response;
				next(); })
			.catch(function(error){ console.log("No entities identified" + error);
				session.beginDialog('clarifyDays'); 
			});
	},
	function(session, results, next){ 
		questionID += 1;
		session.userData.lastMessageReceived = new Date();
		processQuestionnaireResponse(session, session.conversationData.userResponse, 'gad7', questionID, session.userData.questionnaireID);
		next();
	},
    // next question 
	function(session, next){
		session.userData.lastMessageSent = new Date();
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, "How difficult have any of these problems made it for you to do your work, take care of things at home, or get along with other people?");
	},
	function(session, results, next){ 
		session.dialogData.userResponse = results.response;
		recogniseDifficultyEntity(session.message.text)
			.then(function(entity){ 
				session.conversationData.userResponse = results.response;
				next();
			})
			.catch(function(error){ 
				console.log("No entities identified " + error);
				session.beginDialog('clarifyDifficulty');
			});
	},
	function(session, results, next){
		questionID += 1;
		session.userData.lastMessageReceived = new Date();
		processDifficultyResponse(session, session.conversationData.userResponse, 'gad7', questionID, session.userData.questionnaireID);
		next();
	},
    // next question
	function(session){
		session.userData.lastMessageSent = new Date();
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, "Is how you're feeling related to a particular activity or object?");
	}, 
	function(session, results, next){ 
		session.dialogData.userResponse = results.response;
		recogniseActivityEntity(session.message.text)
			.then(function(entity){
				var botResponse = generateBotActivityResponse(entity);
				session.sendTyping();
				session.delay(delayTime);
				session.send(botResponse);
				session.conversationData.userResponse = results.response;
				next(); })
			.catch(function(error){ console.log("No entities identified" + error);
				session.beginDialog('clarifyActivity'); });
	},
    
    function(session, results, next){ 
		questionID += 1;
		session.userData.lastMessageReceived = new Date();
		processActivityResponse(session, session.conversationData.userResponse, 'gad7', questionID, session.userData.questionnaireID);
		next();
	},
    
    // next question 
	function(session){
		session.userData.lastMessageSent = new Date();
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, "Is how you're feeling related to social activities or situations?");
	}, 
	function(session, results, next){ 
		session.dialogData.userResponse = results.response;
		recogniseActivityEntity(session.message.text)
			.then(function(entity){
				var botResponse = generateBotActivityResponse(entity);
				session.sendTyping();
				session.delay(delayTime);
				session.send(botResponse);
				session.conversationData.userResponse = results.response;
				next(); })
			.catch(function(error){ console.log("No entities identified" + error);
				session.beginDialog('clarifyActivity'); });
	},    
    
    function(session, results, next){ 
		questionID += 1;
		session.userData.lastMessageReceived = new Date();
		processActivityResponse(session, session.conversationData.userResponse, 'gad7', questionID, session.userData.questionnaireID);
		next();
	},
    
    //next question 
	function(session){
		session.userData.lastMessageSent = new Date();
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, "Is how you're feeling related to being alone or in crowds?");
	}, 
	function(session, results, next){ 
		session.dialogData.userResponse = results.response;
        recogniseActivityEntity(session.message.text)
			.then(function(entity){
				var botResponse = generateBotActivityResponse(entity);
				session.sendTyping();
				session.delay(delayTime);
				session.send(botResponse);
				session.conversationData.userResponse = results.response;
				next(); })
			.catch(function(error){ console.log("No entities identified" + error);
				session.beginDialog('clarifyActivity'); });
	},   
    
    function(session, results, next){ 
		questionID += 1;
		session.userData.lastMessageReceived = new Date();
		processActivityResponse(session, session.conversationData.userResponse, 'gad7', questionID, session.userData.questionnaireID);
		next();
	},
    
    //next question
	function(session){
		session.userData.lastMessageSent = new Date();
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, "When you feel this way do you have any associated impulses or repeated behaviour?");
	}, 
	function(session, results, next){ 
		session.dialogData.userResponse = results.response;
		recogniseActivityEntity(session.message.text)
			.then(function(entity){
				var botResponse = generateBotActivityResponse(entity);
				session.sendTyping();
				session.delay(delayTime);
				session.send(botResponse);
				session.conversationData.userResponse = results.response;
				next(); })
			.catch(function(error){ console.log("No entities identified" + error);
				session.beginDialog('clarifyActivity'); });
	},  
    
    function(session, results, next){ 
		questionID += 1;
		session.userData.lastMessageReceived = new Date();
		processActivityResponse(session, session.conversationData.userResponse, 'gad7', questionID, session.userData.questionnaireID);
		next();
	},
    
    //next question  
	function(session){
		session.userData.lastMessageSent = new Date();
		session.sendTyping();
		session.delay(delayTime);
		builder.Prompts.text(session, "Do you think you fear is unreasonable or excessive in any way?");
	}, 
	function(session, results, next){ 
		session.dialogData.userResponse = results.response;
		recogniseActivityEntity(session.message.text)
			.then(function(entity){
				var botResponse = generateBotActivityResponse(entity);
				session.sendTyping();
				session.delay(delayTime);
				session.send(botResponse);
				session.conversationData.userResponse = results.response;
				next(); })
			.catch(function(error){ console.log("No entities identified" + error);
				session.beginDialog('clarifyActivity'); });
	},
    
    function(session, results, next){ 
		questionID += 1;
		session.userData.lastMessageReceived = new Date();
		processActivityResponse(session, session.conversationData.userResponse, 'gad7', questionID, session.userData.questionnaireID);
		next();
	},

    // final score is finalised
	function(session, results, next){
		var severity = getSeverity(totalScore);
		console.log("The user's score of %i indicates that the user has %s anxiety", totalScore, severity);
		session.sendTyping();
		session.delay(delayTime);
		session.send('Thanks for answering these questions ' + session.userData.username + '. You\'ve just been through the GAD-7 questionnaire. Your score is %i, which will be useful for a clinician. Please do this questionnaire regularly and, if after two weeks you don\'t feel any better, please share your score and your responses with a clinician. Your data is available at the [MhtBot:Data](http://mhtbotdbaccess.azurewebsites.net) site.', totalScore);
		next();
	},
	function(session){
		session.sendTyping();
		session.delay(delayTime);
		session.endConversation("I'll say goodbye for now " + session.userData.username + " but just say hello when you'd like to talk again :)");
	},
]);


//============//
// Functions
//============//

//-----------------------------//
// Miscellaneous Functions
//----------------------------//

// a function that replaces single quotes with double single quotes
function replaceSingleQuotes(str){
	str = str.replace("'", "''");
	console.log(str);
	return str;
}

//----------------------------------//
// Generate Bot Response Functions
//---------------------------------//

// once LUIS has extracted how the user is feeling, an appropiate response will be returned
function generateBotGeneralQResponse(feeling){
	console.log("In generateBotGeneralResponse() dialog");
	if(feeling == 'Depressed' || feeling == 'Anxious' || feeling == 'DepressedAndAnxious'){
		return "I'm sorry to hear that you're feeling that way.";
	}else if(feeling == 'Happy'){
		return "That's great to hear! Think about what made you happy and do it again.";
	}else{
		return "Thank you, for telling me.";
	}
}

// returns thanks as a general bot response
function generateBotGeneralQResponse2(){
	return "Thank you."
}

// once LUIS has extracted how the user is feeling, an appropiate response will be returned
function generateBotQuestionnaireResponse(entity){
	if(entity == 'NotAtAll'){
		return "Fantastic news!";
	}else{
		return "Thank you.";
	}
}

// once LUIS has extracted if an activity impacts the user, an appropiate response will be returned
function generateBotActivityResponse(entity){
	if(entity == 'Yes'){
		return "Thank you for telling me.";
	}else{
		return "That's great! I'm glad to hear it.";
	}
}

//------------------//
// Time Functions
//------------------//

// function to get the time a bot sends a message
function getBotMsgTime(session){
	console.log("getBotMsgTime() executing");
	var botTime = new Date(session.userData.lastMessageSent);
	console.log("Bot time unformatted is:");
	console.log(botTime);

	var botTimeFormatted = dateFormat(botTime, "yyyy-mm-dd HH:MM:ss");

	console.log("Bot messaged at: " + botTimeFormatted);
	return botTimeFormatted;
}


// function to get the time the user sends a message
function getUserMsgTime(session){
	console.log("getUserMsgTime() executing");
	var userTime = new Date(session.userData.lastMessageReceived);
	console.log("User unformatted is:");
	console.log(userTime);

	var userTimeFormatted = dateFormat(userTime, "yyyy-mm-dd HH:MM:ss");
	console.log("User time formatted:" + userTimeFormatted);

	return userTimeFormatted;
}

// fucntion to get the time latency between a user sending a message and the bot 
// particularly useful for long periods which may lead to issues being raised
function getTimeLapse(session){
	console.log("getTimeLapse() executing");
	var botTime = new Date(session.userData.lastMessageSent);
	var userTime = new Date(session.message.localTimestamp);
	var userTimeManual = new Date(session.userData.lastMessageReceived);
	console.log("Time Lapse Info:");
	var timeLapseMs = userTimeManual - botTime;
	console.log("Time lapse in ms is: " + timeLapseMs);
	var timeLapseHMS = convertMsToHMS(timeLapseMs);
	console.log("Time lapse in HH:MM:SS: " + timeLapseHMS);
	return timeLapseHMS;
}

//https://stackoverflow.com/questions/29816872/how-can-i-convert-milliseconds-to-hhmmss-format-using-javascript
// funtion to convert milli seconds to a format of hours minutes seconds
function convertMsToHMS(ms){
	var ss = ms/1000;
	var ss = ms/1000;
	var hh = parseInt(ss/3600);
	ss = ss % 3600;
	var mm = parseInt(ss/60);
	ss = ss % 60;

	return(hh + ":" + mm + ":" + ss);
}


// function logs when a new PHQ9 or GAD7 questionnaire is begun under the allocated userid
function beginNewQuestionnaire(session, userID, questionnaireType){
	return new Promise(
		function(resolve, reject){
			request = new Request(
				"INSERT INTO Questionnaires (UserID, QuestionnaireType) VALUES (" + userID + ", '" + questionnaireType + "'); SELECT @@identity",
				function(err){
					if(!err){
						console.log("Successful insert into Questionnaires");
					}else{
						console.log("Error in inserting into Questionnaires. " + err);
					}
				}
				);

			request.on('row', function(columns){
				console.log("New questionnaireID is: " + columns[0].value);
				session.userData.questionnaireID = columns[0].value;
				resolve(columns[0].value);
			});
			connection.execSql(request);
		});
}

//----------------------------//
// Process Response Functions
//---------------------------//

// each of the general questions are processed by this to insert user response into more tables
function processGeneralQResponse(session, response, questionID, questionnaireID){
	// Gets timestamp information
	var botTimeFormatted = new Date(getBotMsgTime(session));
	var userTimeFormatted = new Date(getUserMsgTime(session));
	var timeLapseHMS = getTimeLapse(session);

	// inserts data into UserReponses table 
	insertIntoUserResponses(response)
		// Using the interactionID created by the insertion, inserts the user response data into the other relevant tables
		.then(function(interactionID){ 
			insertGeneralQResponseData(interactionID, botTimeFormatted, userTimeFormatted, timeLapseHMS, questionID, session.userData.userID, response, questionnaireID)
			
		})
		.catch(function(error){console.log("Error in insertIntoUserResponses() promise function. Now in catch statement " + error)});
}

// each of the questions regarding days are processed by this to insert user response into more tables
// the question score and total score for the survey are calculated here
function processQuestionnaireResponse(session, results, questionnaireType, questionID, questionnaireID){
	console.log("Executing processQuestionnaireResponse()");
	var userResponse = results;
	var botTimeFormatted = new Date(getBotMsgTime(session));
	var userTimeFormatted = new Date(getUserMsgTime(session));
	var timeLapseHMS = getTimeLapse(session);

	builder.LuisRecognizer.recognize(session.message.text, process.env.LUIS_MODEL_URL,
		function(err, intents, entities, compositeEntities){
			console.log("Now in LUIS Recognizer in processQuestionnaireResponse() function");
			var qScore = 0;

			console.log("Intents and confidence scores identified are:");
			console.log(intents);
			console.log("Intent with highest certainty is:");
			console.log(intents[0]);
			console.log("Entities identified are:");
			console.log(entities);

			if(intents[0] != null && intents[0].intent == 'Days' && entities[0] !=null){
				console.log("Intent is \'Days\' and a relevant entity has been identified");
				console.log("Highest confidence entity identified is:"); 
				console.log(entities[0]);

				var entity = entities[0].type;
				console.log("Entity recognised is: %s", entities[0].type);

				qScore = getScore(entity);
				console.log("individual question score is: " + qScore);

				totalScore+=getScore(entity);
				console.log("Total score after this question is %i", totalScore);
			}else{
				console.log("One of the following occured: no intents identified; intent identified was not 'Days'; no entities were identified");
				qScore = 0;
			}
            
            // the user response is added to the required tables
			insertIntoUserResponses(userResponse)
				.then(function(interactionID){ 
					insertQuestionnaireResponseData(interactionID, botTimeFormatted, userTimeFormatted, timeLapseHMS, questionID, session.userData.userID, userResponse, questionnaireType, qScore, questionnaireID)
					
				})
				.catch(function(error){console.log("Error in insertIntoUserResponses() promise in processQuestionnaireResponse(). Now in catch statement. " + error)});
		}
	);
}

// each of the questions regarding difficulty are processed by this to insert user response into more tables
// the question score and total score for the survey are calculated here
function processDifficultyResponse(session, results, questionnaireType, questionID, questionnaireID){
	var userResponse = results;
	var botTimeFormatted = new Date(getBotMsgTime(session));
	var userTimeFormatted = new Date(getUserMsgTime(session));
	var timeLapseHMS = getTimeLapse(session);

	builder.LuisRecognizer.recognize(session.message.text, process.env.LUIS_MODEL_URL,
		function(err, intents, entities, compositeEntities){
			console.log("Now in recogniseDifficultyEntity() function");

			console.log("Intents and confidence scores identified are:");
			console.log(intents);
			console.log("Intent with highest confidence score is:");
			console.log(intents[0]);
			console.log("Entities identified are:");
			console.log(entities);

			if(intents[0] != null && intents[0].intent == 'Difficulty' && entities[0] != null){
				console.log("Intent is 'Difficulty' and a relevant entity has been identified");
				console.log("Highest confidence entity identified is:");
				console.log(entities[0]);

				var difficultyEntity = entities[0].type;
				console.log("Entity recognised is: %s:", entities[0].type);

				console.log("Final total score is after this question is %i", totalScore);
			}else{
				console.log("One of the following occured: no intents identified; intent identified was not 'Difficulty'; no entities were identified");
			}
            
            // the user response is added to the required tables
			insertIntoUserResponses(userResponse)
			.then(function(interactionID){ 
				insertQuestionnaireEndData(interactionID, botTimeFormatted, userTimeFormatted, timeLapseHMS, questionID, session.userData.userID, userResponse, questionnaireType, 0, totalScore, difficultyEntity, questionnaireID);
				
			})
			.catch(function(error){
				console.log("In processDifficultyResponse() catch statement. Error: " + error)
			});
		}
	);
}

// each of the questions regarding activity are processed by this to insert user response into more tables
function processActivityResponse(session, results, questionnaireType, questionID, questionnaireID){
	var userResponse = results;
	var botTimeFormatted = new Date(getBotMsgTime(session));
	var userTimeFormatted = new Date(getUserMsgTime(session));
	var timeLapseHMS = getTimeLapse(session);

	builder.LuisRecognizer.recognize(session.message.text, LUIS,
		function(err, intents, entities, compositeEntities){
			console.log("Now in recogniseDifficultyEntity() function");

			console.log("Intents and confidence scores identified are:");
			console.log(intents);
			console.log("Entities identified are:");
			console.log(entities);

			if(intents[0] != null && intents[0].intent == 'Activity' && entities[0] != null){
				console.log("Intent is 'Difficulty' and a relevant entity has been identified");
				console.log("Yes entity identified is:");
				console.log(entities[0]);

				var activityEntity = entities[0].type;
				console.log("Entity recognised is: %s:", entities[0].type);

				console.log("Final total score is after this question is %i", totalScore);
			}else{
				console.log("One of the following occured: no intents identified; intent identified was not 'Activity'; no entities were identified");
			}
            
            // the user response is added to the required tables
			insertIntoUserResponses(userResponse)
			.then(function(interactionID){ 
				insertQuestionnaireEndData(interactionID, botTimeFormatted, userTimeFormatted, timeLapseHMS, questionID, session.userData.userID, userResponse, questionnaireType, 0, totalScore, activityEntity, questionnaireID);
				
			})
			.catch(function(error){
				console.log("In processActivityResponse() catch statement. Error: " + error)
			});
		}
	);
}

//----------------------------//
// Database Insert Functions
//---------------------------//

// function called when adding user reponses to a table using SQL INSERTs
function insertIntoUserResponses(userResponse){
	console.log("executing insertIntoUserResponse()");
	return new Promise(
		function(resolve, reject){
			request = new Request(
				"INSERT INTO UserResponses (UserResponse) VALUES ('" + replaceSingleQuotes(userResponse) + "'); SELECT @@identity",
				function(err, rowCount, rows){
					if(!err){
						console.log("user response successfully inserted into UserResponses");
					}else{
						console.log("Error in inserting into UserResponsesNews:" + err);
					}
				}
			);

			request.on('row', function(columns){
				console.log("new interactionID in function is " + columns[0].value);
				returnSentiment(userResponse, columns[0].value);
				//returnKeywords(userResponse, columns[0].value);
				resolve(columns[0].value);
			});
            // the user responses request to add them to a database is executed
			connection.execSql(request);
	});
}

// for the general questions each of the reponses are logged to the required tables
function insertGeneralQResponseData(interactionID, botTime, userTime, timeLapse, questionID, userID, userResponse, questionnaireID){
	console.log("InteractionID: " + interactionID);
	console.log("BotTime: " + botTime);
	console.log("UserTime: " + userTime);
	console.log("TimeLapse: " + timeLapse);
	console.log("QuestionID: " + questionID);
	console.log("UserID: " + userID);
	console.log("UserResponse: " + userResponse);
	//console.log("QuestionnaireType: " + questionnaireType);
	//console.log("qScore: " + qScore);
	console.log("questionnaireID " + questionnaireID);

	request = new Request(
		"INSERT INTO Timestamps (InteractionID, BotMsgTime, UserMsgTime, TimeLapse) " 
			+ "VALUES (" + mysql.escape(interactionID) + "," + mysql.escape(botTime) + "," + mysql.escape(userTime) + "," + mysql.escape(timeLapse) + "); " 
		+ "INSERT INTO InteractionQuestionIDs (InteractionID, QuestionID) "
			+ "VALUES (" + mysql.escape(interactionID) + "," + mysql.escape(questionID) + ");"
		+ "INSERT INTO UserInteractions (InteractionID, UserID) "
			+ "VALUES (" + mysql.escape(interactionID) + "," + mysql.escape(userID) + "); "
		+ "INSERT INTO QuestionScores(QuestionnaireID, InteractionID, Score) "
			+ "VALUES (" + questionnaireID + "," + mysql.escape(interactionID) + "," + 0 + ");",
				function(err, rowCount, rows){
					if(!err){
						console.log("Data succesfully inserted into tables: Timestamps, InteractionQuestionIDs, UserInteractions");
					}else{
						console.log("Error in insertGeneralQResponseData() query. " + err);
					}
				}
		);
		connection.execSql(request);
}

// for the in questionnaire questions each of the reponses are logged to the required tables
function insertQuestionnaireResponseData(interactionID, botTime, userTime, timeLapse, questionID, userID, userResponse, questionnaireType, qScore, questionnaireID){
	console.log("InteractionID: " + interactionID);
	console.log("BotTime: " + botTime);
	console.log("UserTime: " + userTime);
	console.log("TimeLapse: " + timeLapse);
	console.log("QuestionID: " + questionID);
	console.log("UserID: " + userID);
	console.log("UserResponse: " + userResponse);
	console.log("QuestionnaireType: " + questionnaireType);
	console.log("qScore: " + qScore);
	console.log("questionnaireID " + questionnaireID);
	request = new Request(
		"INSERT INTO Timestamps (InteractionID, BotMsgTime, UserMsgTime, TimeLapse) " 
			+ "VALUES (" + mysql.escape(interactionID) + "," + mysql.escape(botTime) + "," + mysql.escape(userTime) + "," + mysql.escape(timeLapse) + "); " 
		+ "INSERT INTO InteractionQuestionIDs (InteractionID, QuestionID) "
			+ "VALUES (" + mysql.escape(interactionID) + "," + mysql.escape(questionID) + ");"
		+ "INSERT INTO UserInteractions (InteractionID, UserID) "
			+ "VALUES (" + mysql.escape(interactionID) + "," + mysql.escape(userID) + "); "
		+ "INSERT INTO QuestionScores(QuestionnaireID, InteractionID, Score) "
			+ "VALUES (" + questionnaireID + "," + mysql.escape(interactionID) + "," + mysql.escape(qScore) + ");",
				function(err, rowCount, rows){
					if(!err){
						console.log("Questionnaire user response data successfully inserted into tables: Timestamps, InteractionQuestionIDs, UserInteractions, QuestionScores, TotalScores");
					}else{
						console.log("Error in inserting questionnaire response data." + err);
					}
				}
	);
	connection.execSql(request);
}

// for the in questionnaire questions each of the end reponses are logged to the required tables
function insertQuestionnaireEndData(interactionID, botTime, userTime, timeLapse, questionID, userID, userResponse, questionnaireType, qScore, totalScore, difficultyEntity, questionnaireID){
	console.log("In insertQuestionnnaireEndData()");
	console.log("QuestionnaireID is: " + questionnaireID);
	request = new Request(
		"INSERT INTO Timestamps (InteractionID, BotMsgTime, UserMsgTime, TimeLapse) " 
			+ "VALUES (" + mysql.escape(interactionID) + "," + mysql.escape(botTime) + "," + mysql.escape(userTime) + "," + mysql.escape(timeLapse) + "); " 
		+ "INSERT INTO InteractionQuestionIDs (InteractionID, QuestionID) "
			+ "VALUES (" + mysql.escape(interactionID) + "," + mysql.escape(questionID) + ");"
		+ "INSERT INTO UserInteractions (InteractionID, UserID) "
			+ "VALUES (" + mysql.escape(interactionID) + "," + mysql.escape(userID) + "); " 
		+ "INSERT INTO QuestionScores(QuestionnaireID, InteractionID, Score) "
			+ "VALUES (" + questionnaireID + "," + mysql.escape(interactionID) + "," + mysql.escape(qScore) + ");"
		+ "INSERT INTO Difficulty (QuestionnaireID, Difficulty) " +
		  	"VALUES (" + questionnaireID + ",' " + difficultyEntity + "');" +
		  "INSERT INTO TotalScores (QuestionnaireID, TotalScore, DateCompleted) " +
		  	"VALUES ('" + mysql.escape(questionnaireID) + "'," + mysql.escape(totalScore) + ","  + mysql.escape(userTime) + ");",
				function(err, rowCount, rows){
					if(!err){
						console.log("Completed questionnaire user response data successfully inserted into tables: Timestamps, InteractionQuestionIDs, UserInteractions, Difficulty, TotalScores");
					}else{
						console.log("Error in inserting questionnaire end data. " + err);
					}
				}
	);
	connection.execSql(request);
}

// the sentiment scores for each user/bot interaction are inserted into the database
function insertIntoSentimentTable(sentimentScore, interactionID){

	request = new Request(
		"INSERT INTO Sentiment (InteractionID, SentimentScore) VALUES (" + mysql.escape(interactionID) + "," + mysql.escape(sentimentScore) + ")",
				function(err, rowCount, rows){
					if(!err){
						console.log("Sentiment score successfully inserted into Sentiments table");
					}else{
						console.log("Error in inserting into Sentiments table:" + err);
					}
				}
	);
	connection.execSql(request);
}	

//----------------------------------//
// Recognise LUIS Entity Functions
//--------------------------------//

// function to recognise the the feeling of the user
function recogniseFeeling(text){
    // a promise object is usedfor the 
	return new Promise(
		function(resolve, reject){
			builder.LuisRecognizer.recognize(text, process.env.LUIS_MODEL_URL,
				function(err, intents, entities, compositeEntities){
					if(!err){
						console.log("Now in recogniseFeeling() function");
                        
                        // intents are how LUIS determines what a user wants to do
                        // entities are used to store and pass important information
						console.log("Intents and confidence scores identified are:");
						console.log(intents);
						console.log("Intent with highest confidence score is:");
						console.log(intents[0]);
						console.log("Entities identified are:");
						console.log(entities);
                        
                        // the feeling boolean feeling state variables are initialised to false
						var depressed = false;
						var anxious = false;
						var happy = false;

						console.log("Number of entities identified");
						console.log(entities.length);

						//if(intents[0] != null && intents[0].intent = 'Feeling' && entities

                        // if an intent and entity has been identified 
						if(intents[0]!=null && entities[0]!=null){
							console.log("At least one intent and entity have been identified");
                            
                            // all the entities are iterated through to check if the feeling matches the user's 
							for(i=0; i<entities.length; i++){
								if(entities[i].type == 'Depressed'){
									depressed = true;
									console.log("'Depressed' entity recognised");
								}else if(entities[i].type == 'Anxious'){
									anxious = true;
									console.log("'Anxious' entity recognised");
								}else if(entities[i].type == 'Happy'){
									happy = true;
									console.log("'Happy' entity recognised");
								}
							}
                            
                            // the global variable feeling is changed depending on what feeling has been identified by LUIS
							if(depressed == true && anxious == true){
								feeling = 'DepressedAndAnxious';
								console.log("Global variable 'feeling' set to 'DepressedAndAnxious'");
							}else if(depressed == true){
								feeling = 'Depressed';
								console.log("Global variable 'feeling' set to 'Depressed'");
							}else if(anxious == true){
								feeling = 'Anxious';
								console.log("Global variable 'feeling' set to 'Anxious'");
							}else if(happy == true){
								feeling = 'Happy';
								console.log("Global variable 'feeling' set to 'Happy'");
							}
                            // the promise has completed the operation, resolve
							resolve(feeling);

						}else{
                            // case where no intents and entites have been identified by LUIS
							console.log("One of the following occured: no intents identified; no entities were identified");
                            // the promise has not completed the operation, reject
							reject();
						}
					}else{
							console.log("Error in recogniseFeeling()" + err);
					}
				}
			);
		}
	);
}

// function to recognise the the feeling of the user
function recogniseDayEntity(text){
	return new Promise(
		function(resolve, reject){
			builder.LuisRecognizer.recognize(text, process.env.LUIS_MODEL_URL,
				function(err, intents, entities, compositeEntities){
					console.log("Now in LUIS Recogniser in recogniseDayEntity() function");
					var qScore = 0;

					console.log("Intents and confidence scores identified are:");
					console.log(intents);
					console.log("Intent with highest confidence score is:");
					console.log(intents[0]);
					console.log("Entities identified are:");
					console.log(entities);
                    
                    // if an intent of type Days and entity has been identified 
					if(intents[0] != null && intents[0].intent == 'Days' && entities[0] !=null){
						console.log("Intent is 'Days' and a relevant entity has been identified");
						console.log("Highest confidence entity identified is:"); 
						console.log(entities[0]);

						var entity = entities[0].type;
						console.log("Entity recognised is: %s", entities[0].type);
                        
                        // the promise has completed the operation, resolve
						resolve(entity);
					}else{
                        // case where no intents and entites have been identified by LUIS
						console.log("One of the following occured: no intents identified; intent identified was not 'Days'; no entities were identified");
                        // question score set to 0 because no analysis can be done by LUIS
						qScore = 0;
                        // the promise has not completed the operation, reject
						reject();
					}
				});
		});
}

// function to recognise the the difficulty of the user
function recogniseDifficultyEntity(text){
	return new Promise(
		function(resolve, reject){
			builder.LuisRecognizer.recognize(text, process.env.LUIS_MODEL_URL,
				function(err, intents, entities, compositeEntities){
					console.log("Now in recogniseDifficultyEntity() function");
					var qScore = 0;

					console.log("Intents and confidence scores identified are:");
					console.log(intents);
					console.log("Intent with highest confidence score is:");
					console.log(intents[0]);
					console.log("Entities identified are:");
					console.log(entities);

					if(intents[0] != null && intents[0].intent == 'Difficulty' && entities[0] != null){
						console.log("Intent is 'Difficulty' and a relevant entity has been identified");
						console.log("Highest confidence entity identified is:");
						console.log(entities[0]);

						var entity = entities[0].type;
						console.log("Entity recognised is: %s:", entities[0].type);

						resolve(entity);
					}else{
						console.log("One of the following occured: no intents identified; intentt identified was not 'Difficulty'; no entities were identified");
						qScore = 0;
						reject();
					}
				}
			);
		}
	);
}

// function to recognise the the acitivity the user
function recogniseActivityEntity(text){
	return new Promise(
		function(resolve, reject){
			builder.LuisRecognizer.recognize(text, LUIS,
				function(err, intents, entities, compositeEntities){
					console.log("Now in recogniseActivityEntity() function");
					var qScore = 0;

					console.log("Intents and confidence scores identified are:");
					console.log(intents);
					console.log("Intent with highest confidence score is:");
					console.log(intents[0]);
					console.log("Entities identified are:");
					console.log(entities);

					if(intents[0] != null && intents[0].intent == 'Activity' && entities[0] != null){
						console.log("Intent is 'Activity' and a relevant entity has been identified");
						console.log("Highest confidence entity identified is:");
                        console.log("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
						console.log(entities[0]);

						var entity = entities[0].type;
						console.log("Entity recognised is: %s:", entities[0].type);

						resolve(entity);
					}else{
						console.log("One of the following occured: no intents identified OR intent identified was not 'Activity' OR no entities were identified");
						//code reaches this point
                        qScore = 0;
						reject();
					}
				}
			);
		}
	);
}
//----------------------//
// Scoring Functions
//--------------------//

// fucntion used to generate numbering system for days difficulty
function getScore(entity){
	// each entity represents a number
    // the the higher the number the more frequent
    var score = 0;
	switch(entity){
		case 'NotAtAll':
			return 0;
			break;
		case 'SeveralDays':
			return 1;
			break;
		case 'MoreThanHalfTheDays':
			return 2;
			break;
		case 'NearlyEveryDay':
			return 3;
			break;
		default:
			return 20;
	}
}

//function to return back how severe the user's conditon is based on their final score
function getSeverity(finalScore){
	var s = finalScore;
    switch(s){
        case (s>=0 && s<=5):
            return 'mild';
            break;
        case (s>=6 && s<=10):
            return 'moderate';
            break;
        case (s>=11 && s<=15):
            return 'moderately severe';
            break;
        default:
            return 'severe';
            break;
    }
}
    
//------------------------------//
// Sentiment Analysis Functions
//-----------------------------//

// function to gather how positive or negative a user is feeling 
// the sentiment is used when storing user data 
function returnSentiment(text, qID){
	return sentimentService
				.getSentiment(text)
				.then(function(sentiment){ handleSentimentSuccessResponse(sentiment, qID); })
				.catch(function(error){ handleErrorResponse(error); });
}

// function logs whether sentiment analysis has been successful or not
function handleSentimentSuccessResponse(sentimentScore, interactionID){
	if(sentimentScore){
		console.log("Sentiment Analysis successful");
        // if successful then the sentiment score is added to the sentiment table 
		insertIntoSentimentTable(sentimentScore, interactionID);
	}else{
		console.log("Sentiment score could not get result");
	}
}

// function to handle error response for sentiment analysis loggeed to console
function handleErrorResponse(session, error){
	var clientErrorMessage = 'Oops! Something went wrong. Try again later.';
    if (error.message && error.message.indexOf('Access denied') > -1) {
        clientErrorMessage += "\n" + error.message;
    }

    console.error(error);
    //session.send(clientErrorMessage);
}
