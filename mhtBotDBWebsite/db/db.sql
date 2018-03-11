
-- Stores all questions the user is asked --
/* Note: this is populated before the chatbot is used */
CREATE TABLE AllQuestions(
	QuestionID INT PRIMARY KEY,
	QuestionType	VARCHAR(128),
	Question	VARCHAR(max)
);

CREATE TABLE Users(
	UserID	INT IDENTITY PRIMARY KEY, 
	Username	VARCHAR(128), 
	Password	VARCHAR(128)
);

CREATE TABLE UserResponses(
	InteractionID INT IDENTITY PRIMARY KEY,
	UserResponse	NVARCHAR(max)
);

CREATE TABLE Timestamps(
	InteractionID	INT PRIMARY KEY,
	BotMsgTime	DATETIME,
	UserMsgTime	DATETIME,
	TimeLapse	TIME
);

CREATE TABLE UserInteractions(
	InteractionID	INT,
	UserID	INT, 
	PRIMARY KEY(InteractionID, UserID)
);

CREATE TABLE Sentiment(
	InteractionID	INT PRIMARY KEY,
	SentimentScore	FLOAT
);

CREATE TABLE InteractionQuestionIDs(
	InteractionID INT PRIMARY KEY,
	QuestionID	INT
);

CREATE TABLE QuestionScores(
	InteractionID INT PRIMARY KEY,
	Score INT,
	QuestionnaireID	INT
);

CREATE TABLE TotalScores(
	QuestionnaireID	INT PRIMARY KEY,
	TotalScore INT,
	DateCompleted DATETIME,
);

CREATE TABLE Questionnaires(
	QuestionnaireID INT IDENTITY PRIMARY KEY,
	UserID	INT,
	QuestionnaireType	VARCHAR(128)
);

CREATE TABLE Difficulty(
	QuestionnaireID	INT PRIMARY KEY,
	Difficulty	INT
);
