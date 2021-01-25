const firebase = require("firebase");
const admin = require("firebase-admin");

//firebase.initializeApp(config); //so that firebase knows which app we are talking about
const db = admin.firestore();

const config = require("../util/config");

const {
  validateSignupData,
  validateLoginData,
  reduceUserDetails,
} = require("../util/validators");

// Sign user up
exports.signup = (req, res) => {
  const newUser = {
    email: req.body.email,
    password: req.body.password,
    confirmPassword: req.body.confirmPassword,
    handle: req.body.handle,
  };

  const { valid, errors } = validateSignupData(newUser);

  if (!valid) return res.status(400).json(errors);

  const noImg = "no-img.png";

  let token, userId;
  db.doc(`/users/${newUser.handle}`)
    .get()
    .then((doc) => {
      // firebase will still return a snapshot even if the document doesnt exist
      if (doc.exists) {
        //means userId has already taken
        return res
          .status(400)
          .json({ userId: "this User ID has already taken" });
      } else {
        return firebase
          .auth()
          .createUserWithEmailAndPassword(newUser.email, newUser.password);
      }
    })
    .then((data) => {
      //the credential is returned
      //if we are here then we've successfully registered
      userId = data.user.uid;
      return data.user.getIdToken();
    })
    .then((idToken) => {
      token = idToken;
      const userCredentials = {
        handle: newUser.handle,
        createdAt: new Date().toISOString(),
        imageUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${noImg}?alt=media`,
        userId,
      };
      userCredentials.contact = { email: newUser.email };
      return db.doc(`/users/${newUser.handle}`).set(userCredentials);
    })
    .then(() => {
      return res.status(201).json({ token });
    })
    .catch((err) => {
      console.error(err);
      if (err.code === "auth/email-already-in-use") {
        return res.status(400).json({ error: "Email is already in use" });
      } else {
        return res
          .status(500)
          .json({ error: "Something went wrong, please try again" });
      }
    });
};

// Log user in (token expires after an hour)
exports.login = (req, res) => {
  const user = {
    email: req.body.email,
    password: req.body.password,
  };

  const { valid, errors } = validateLoginData(user);

  if (!valid) return res.status(400).json(errors);

  firebase
    .auth()
    .signInWithEmailAndPassword(user.email, user.password)
    .then((data) => {
      return data.user.getIdToken();
    })
    .then((token) => {
      return res.json({ token });
    })
    .catch((err) => {
      console.error(err);
      // auth/wrong-password
      // auth/user-not-user
      return res
        .status(403)
        .json({ error: "Wrong credentials, please try again" });
    });
};

// Add user details
exports.updateUserDetails = (req, res) => {
  let { userDetails, errors, valid } = reduceUserDetails(req.body);

  if (!valid) return res.status(400).json(errors);

  userDetails.contact.email = req.user.email;

  db.doc(`/users/${req.user.handle}`)
    .update(userDetails)
    .then(() => {
      // update the user's post/item addresses
      return db
        .collection("posts")
        .where("userHandle", "==", req.user.handle)
        .get();
    })
    .then((data) => {
      const promises = [];
      data.forEach((doc) => {
        promises.push(doc.ref.update({ location: userDetails.location }));
      });

      return Promise.all(promises);
    })
    .then(() => {
      return res.json({ message: "Details updated successfully" });
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};

// Get own user details
exports.getAuthenticatedUser = (req, res) => {
  let userData = {};
  //console.log(req.user.handle);
  db.doc(`/users/${req.user.handle}`)
    .get()
    .then((doc) => {
      if (!doc.exists) throw res.status(404).json({ error: "User not found" });

      userData.credentials = doc.data();
      return res.json(userData);
    })
    .catch((err) => {
      return err;
      // return res.status(500).json({ error: err.code });
    });
};

// Upload a profile image
exports.uploadImage = (req, res) => {
  const BusBoy = require("busboy");
  const path = require("path");
  const os = require("os");
  const fs = require("fs");

  const busboy = new BusBoy({ headers: req.headers });

  let imageFileName = "";
  let imageToBeUploaded = {};

  busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
    //console.log(fieldname); //image
    //console.log(filename);  //Ideas.jpg
    //console.log(mimetype);  //image/jpeg  /  text/plain (if .txt files)

    if (mimetype !== "image/jpeg" && mimetype !== "image/png") {
      return res.status(400).json({ error: "Wrong file type submitted" });
    }
    //get the extension
    const imageExtension = filename.split(".")[filename.split(".").length - 1];
    //img.png => 2341241234123432.png
    imageFileName = `${Math.round(
      Math.random() * 1000000000000
    )}.${imageExtension}`;
    const filepath = path.join(os.tmpdir(), imageFileName);

    imageToBeUploaded = { filepath, mimetype };
    file.pipe(fs.createWriteStream(filepath));
  });

  //after uploaded the file
  busboy.on("finish", () => {
    admin
      .storage()
      .bucket(config.storageBucket)
      .upload(imageToBeUploaded.filepath, {
        resumable: false,
        metadata: { metadata: { contentType: imageToBeUploaded.mimetype } },
      })
      .then(() => {
        //without the 'alt=media' parameter the link is just gonna download the image instead of displaying it
        const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`;
        return db.doc(`/users/${req.user.handle}`).update({ imageUrl });
      })
      .then(() => {
        // delete the previous image in storage if exist
        const imageUrl = req.user.imageUrl;
        if (
          imageUrl !==
          "https://firebasestorage.googleapis.com/v0/b/apu-fyp-3cfd9.appspot.com/o/no-img.png?alt=media"
        ) {
          const imageName = imageUrl.match(/\/o\/(.*?)\?alt=media/)[1];
          return admin
            .storage()
            .bucket(config.storageBucket)
            .file(imageName)
            .delete();
        }
      })
      .then(() => {
        return res.json({ message: "image uploaded successfully" });
      })
      .catch((err) => {
        console.error(err);
        return res.status(500).json({ error: err.code });
      });
  });

  req.pipe(busboy); //rawBody is a property in every request object
};
