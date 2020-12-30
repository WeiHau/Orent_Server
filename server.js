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
  getPosts,
  getAllPosts,
} = require("./handlers/posts");
app.get("/api/post/:postId", getPost); // get detail of a post
app.get("/api/posts", FBAuth, getAllPosts); // get all posts
app.get("/api/post", FBAuth, getPosts); // get own posts
app.post("/api/post", FBAuth, postAnItem); // post an item
app.post("/api/post/image", FBAuth, uploadItemImage); // post item image (return the image URL)
app.get("/api/post/:postId/disable", FBAuth, disableItem); // disable item
app.get("/api/post/:postId/enable", FBAuth, enableItem); // enable item
app.delete("/api/post/:postId", FBAuth, deletePost); // delete a post

// user routes
const {
  signup,
  login,
  getAuthenticatedUser,
  uploadImage,
  updateUserDetails,
  getUserDetails,
} = require("./handlers/users");
app.post("/api/signup", signup); // signup route
app.post("/api/login", login); // login route
app.post("/api/user", FBAuth, updateUserDetails); // update user details route
app.get("/api/user", FBAuth, getAuthenticatedUser); // retrieve user details
app.get("/api/user/:handle", getUserDetails); // retrieve other user details
app.post("/api/user/image", FBAuth, uploadImage); // image upload route

app.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});
