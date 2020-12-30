const admin = require("firebase-admin");
const db = admin.firestore();

// middleware
// verifies the token
// update user handle & imageUrl and proceeds to the next request

module.exports = (req, res, next) => {
  let idToken;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    idToken = req.headers.authorization.split("Bearer ")[1];
  } else {
    console.error("No token found");
    return res.status(403).json({ error: "Unauthorized" });
  }

  //verify that the token is issued by our app (not from other sites)
  admin
    .auth()
    .verifyIdToken(idToken)
    .then((decodedToken) => {
      //decodedToken holds the data that is inside of our token, which basically is our user data
      //e.g. decodedToken:
      // {
      //   >    iss: 'https://securetoken.google.com/socialape-873f8',
      //   >    aud: 'socialape-873f8',
      //   >    auth_time: 1597499019,
      //   >    user_id: 'htiaCBJsSwgnDh2XhHQEgQWDf9F3',
      //   >    sub: 'htiaCBJsSwgnDh2XhHQEgQWDf9F3',
      //   >    iat: 1597499019,
      //   >    exp: 1597502619,
      //   >    email: 'user@email.com',
      //   >    email_verified: false,
      //   >    firebase: { identities: { email: [Array] }, sign_in_provider: 'password' },
      //   >    uid: 'htiaCBJsSwgnDh2XhHQEgQWDf9F3'
      //   >
      // }
      req.user = decodedToken; // the passed request(req) will have an additional data from this middleware
      //console.log(decodedToken);
      return db
        .collection("/users")
        .where("userId", "==", req.user.uid)
        .limit(1)
        .get();
    })
    .then((data) => {
      // the docoded token does not have the userHandle, thus it is be added here
      // getting the userHandle from the firestore(db/database)
      req.user.handle = data.docs[0].data().handle;
      req.user.imageUrl = data.docs[0].data().imageUrl;
      req.user.location = data.docs[0].data().location;
      req.user.email = data.docs[0].data().contact.email;
      return next();
    })
    .catch((err) => {
      console.error("Error while verifying token", err);
      return res.status(403).json(err);
    });
};
