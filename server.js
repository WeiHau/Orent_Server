// Programmer Name     : Lim Wei Hau
// Program Name        : server.js
// Description         : The 'main' file that runs upon compile. Initialized firebase, websocket and all the api endpoints
// First Written on    : 20 December 2020
// Last Edited on      : 03 March 2021

const express = require("express");
const cors = require("cors");

require("dotenv/config");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const firebase = require("firebase");
const firebaseConfig = require("./util/config");

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

const admin = require("firebase-admin");
var serviceAccount = {
  type: process.env.FIREBASE_TYPE,
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
};
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});

// authentification middleware
const FBAuth = require("./util/fbAuth");

// post routes
const {
  postAnItem,
  uploadItemImage,
  deletePost,
  disableItem,
  enableItem,
  getPost,
  getMyPosts,
  getAllPosts,
  getUserDetails,
  editPost,
  sendRentalRequest,
  getRentalRequests,
  getRentalActivities,
  approveRentalRequest,
  removeRentalRequest,
} = require("./handlers/posts");
app.get("/api/post/:postId", getPost); // get detail of a post
app.get("/api/posts", FBAuth, getAllPosts); // get all posts
app.get("/api/myposts", FBAuth, getMyPosts); // get own posts
app.post("/api/post", FBAuth, postAnItem); // post an item
app.post("/api/post/image", FBAuth, uploadItemImage); // post item image (return the image URL)
app.get("/api/post/:postId/disable", FBAuth, disableItem); // disable item
app.get("/api/post/:postId/enable", FBAuth, enableItem); // enable item
app.delete("/api/post/:postId", FBAuth, deletePost); // delete a post
app.get("/api/user/:handle", getUserDetails); // retrieve other user details
app.post("/api/post/:postId", FBAuth, editPost); // edit a post

app.post("/api/rentalRequest/", FBAuth, sendRentalRequest); // send a rental request
app.get("/api/rentalRequests/", FBAuth, getRentalRequests);
app.get("/api/rentalActivities/", FBAuth, getRentalActivities);
app.get("/api/rentalRequest/approve/:requestId", FBAuth, approveRentalRequest);
app.get("/api/rentalRequest/remove/:requestId", FBAuth, removeRentalRequest);

// user routes
const {
  signup,
  login,
  getAuthenticatedUser,
  uploadImage,
  updateUserDetails,
  updateExpoPushToken,
} = require("./handlers/users");
app.post("/api/signup", signup); // signup route
app.post("/api/login", login); // login route
app.post("/api/user", FBAuth, updateUserDetails); // update user details route
app.get("/api/user", FBAuth, getAuthenticatedUser); // retrieve user details
app.post("/api/user/image", FBAuth, uploadImage); // image upload route
app.post("/api/user/expoPushToken", FBAuth, updateExpoPushToken);

// message routes
const { getUserMessages, readMessages } = require("./handlers/messages");
app.get("/api/messages", FBAuth, getUserMessages); // get userMessages of the logged in user
app.get("/api/messages/:handle/read", FBAuth, readMessages);

const server = app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});

// socket.io
const io = require("socket.io")(server);

// for notifications
const { Expo } = require("expo-server-sdk");
let expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });

// to save in db for message sent
const db = admin.firestore();

let clients = [];

io.on("connection", (socket) => {
  socket.on("storeClientInfo", (data) => {
    const clientInfo = new Object();
    clientInfo.customId = data.customId;
    console.log("user connected: " + data.customId);
    clientInfo.clientId = socket.id;

    // remove client if already exist in clients list
    clients = clients.filter((client) => client.customId != data.customId);
    clients.push(clientInfo);
    console.log(clients);
  });

  // user sent a message
  socket.on("send-message", (message) => {
    // emit message to recipient
    let recipientClientIndex = clients.findIndex(
      (client) => client.customId == message.recipient
    );
    if (recipientClientIndex !== -1) {
      // if recipient is online (probably)
      // send message to that specific client
      io.to(clients[recipientClientIndex].clientId).emit(
        "receive-message",
        message
      );
    } else if (
      message.recipientPushToken &&
      Expo.isExpoPushToken(message.recipientPushToken)
    ) {
      // Construct a message (see https://docs.expo.io/push-notifications/sending-notifications/)
      const notificationMessage = {
        to: message.recipientPushToken,
        sound: "default",
        title: message.senderFullName,
        body: message.content,
        data: { senderHandle: message.sender },
      };

      let chunks = expo.chunkPushNotifications([notificationMessage]);
      let tickets = [];
      (async () => {
        // Send the chunks to the Expo push notification service. There are
        // different strategies you could use. A simple one is to send one chunk at a
        // time, which nicely spreads the load out over time:
        for (let chunk of chunks) {
          try {
            let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
            // console.log(ticketChunk);
            tickets.push(...ticketChunk);
            // NOTE: If a ticket contains an error code in ticket.details.error, you
            // must handle it appropriately. The error codes are listed in the Expo
            // documentation:
            // https://docs.expo.io/push-notifications/sending-notifications/#individual-errors
          } catch (error) {
            console.error(error);
          }
        }
      })();
    }

    // remove recipientPushToken & senderFullName, we only need that for notifications
    const { recipientPushToken, senderFullName, ...rest } = message;
    // save message to db
    db.collection("messages")
      .add(rest)
      .catch((err) => {
        console.error(err);
      });
  });

  socket.on("pre-disconnect", (data) => {
    let i = clients.findIndex((client) => client.customId == data.customId);
    console.log("user disconnecting: " + data.customId);
    if (i !== -1) clients.splice(i, 1);
    console.log(clients);
  });
});
