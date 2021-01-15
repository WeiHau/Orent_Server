const admin = require("firebase-admin");
const db = admin.firestore();

const config = require("../util/config");

const { validatePost } = require("../util/validators");

// Get all posts
// fetch based on search
// fetch based on category
// fetch based on price
// https://stackoverflow.com/questions/48036975/firestore-multiple-conditional-where-clauses (this may help)

const mismatchAddress = (keyword, itemLocation) =>
  !itemLocation.address.toLowerCase().includes(keyword);

const mismatchPostcode = (keyword, itemLocation) =>
  !itemLocation.postcode.toLowerCase().includes(keyword);

const mismatchCity = (keyword, itemLocation) =>
  !itemLocation.city.toLowerCase().includes(keyword);

const mismatchState = (keyword, itemLocation) =>
  !itemLocation.state.toLowerCase().includes(keyword);

exports.getAllPosts = (req, res) => {
  let postRef = db.collection("posts").where("isAvailable", "==", true);
  if (req.query.hideOwnPosts === "true")
    postRef = postRef.where("userHandle", "!=", req.user.handle);

  let searchText = "";
  if (req.query.search)
    searchText = decodeURIComponent(req.query.search).toLowerCase();

  let categoriesArr;
  if (req.query.categories) categoriesArr = req.query.categories;

  let minPrice;
  if (req.query.minPrice)
    minPrice = Math.round(decodeURIComponent(req.query.minPrice) * 100) / 100;

  let maxPrice;
  if (req.query.maxPrice)
    maxPrice = Math.round(decodeURIComponent(req.query.maxPrice) * 100) / 100;

  let qAddress = req.query.address,
    qPostcode = req.query.postcode,
    qCity = req.query.city,
    qState = req.query.state;
  let locationGiven = qAddress || qPostcode || qCity || qState;
  let mismatchLocation;
  if (locationGiven) {
    locationGiven = decodeURIComponent(locationGiven).toLowerCase();
    if (qAddress) mismatchLocation = mismatchAddress;
    else if (qPostcode) mismatchLocation = mismatchPostcode;
    else if (qCity) mismatchLocation = mismatchCity;
    else if (qState) mismatchLocation = mismatchState;
  }

  postRef.get().then((data) => {
    let posts = [];

    data.forEach((doc) => {
      // filter search

      const { item } = doc.data();

      if (
        searchText &&
        !item.name.toLowerCase().includes(searchText) &&
        !item.description.toLowerCase().includes(searchText)
      )
        return;

      // filter categorize
      if (
        categoriesArr &&
        !categoriesArr.every(
          (category) => item.categories && item.categories.includes(category)
        )
      )
        return;

      // filter price
      if (minPrice && item.price <= minPrice) return;
      if (maxPrice && item.price >= maxPrice) return;

      if (locationGiven && mismatchLocation(locationGiven, doc.data().location))
        return;

      posts.push({
        item: doc.data().item,
        createdAt: doc.data().createdAt,
        userHandle: doc.data().userHandle,
        location: doc.data().location,
        postId: doc.id,
      });
    });

    // sort posts based on date
    posts = posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.json(posts);
  });
};

// Get details of a particular post
// need to get user image & user contact
exports.getPost = (req, res) => {
  let itemDetail = {};

  db.doc(`/posts/${req.params.postId}`)
    .get()
    .then((doc) => {
      if (!doc.exists) return res.status(404).json({ error: "Post not found" });

      itemDetail = doc.data();

      return db.doc(`/users/${itemDetail.userHandle}`).get();
    })
    .then((doc) => {
      if (!doc.exists) return res.status(404).json({ error: "User not found" });

      itemDetail.userImage = doc.data().imageUrl;
      itemDetail.userContact = doc.data().contact;

      return res.json(itemDetail);
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};

// Get own posts
exports.getMyPosts = (req, res) => {
  db.collection("posts")
    .where("userHandle", "==", req.user.handle)
    .orderBy("createdAt", "desc")
    .get()
    .then((data) => {
      const posts = [];

      data.forEach((doc) => {
        posts.push({
          item: doc.data().item,
          isAvailable: doc.data().isAvailable,
          createdAt: doc.data().createdAt,
          postId: doc.id,
        });
      });

      return res.json(posts);
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};

// post an item
exports.postAnItem = (req, res) => {
  let { valid, errors } = validatePost(req.body);
  console.log(req.body);
  if (!valid) return res.status(400).json(errors);

  const newPost = {
    item: { ...req.body, price: Math.round(req.body.price * 100) / 100 },
    isAvailable: true,
    userHandle: req.user.handle, //got thru the middleware
    location: req.user.location,
    createdAt: new Date().toISOString(),
  };

  db.collection("posts")
    .add(newPost)
    .then((doc) => {
      const resPost = newPost;
      resPost.postId = doc.id;
      res.json(resPost);
    })
    .catch((err) => {
      res.status(500).json({ error: "something went wrong" });
      console.error(err);
    });
};

// edit a post
exports.editPost = (req, res) => {
  let { valid, errors } = validatePost(req.body);

  if (!valid) return res.status(400).json(errors);

  const editedPost = {
    item: req.body,
  };

  const document = db.doc(`/posts/${req.params.postId}`);

  const updateDocument = () =>
    document
      .update(editedPost)
      .then(() => {
        return document.get();
      })
      .then((doc) => {
        const resPost = doc.data();
        resPost.postId = doc.id;
        res.json(resPost);
      })
      .catch((err) => {
        res.status(500).json({ error: "something went wrong" });
        console.error(err);
      });

  document
    .get()
    .then((doc) => {
      if (doc.data().item.image !== editedPost.item.image) {
        // delete image in storage
        const imageUrl = doc.data().item.image;
        const imageName = imageUrl.match(/\/o\/(.*?)\?alt=media/)[1];

        return admin
          .storage()
          .bucket(config.storageBucket)
          .file(imageName)
          .delete();
      }
    })
    .then(() => {
      updateDocument();
    })
    .catch(() => {
      // probably image/object not found for deleting
      updateDocument();
    });
};

// delete a post
exports.deletePost = (req, res) => {
  const document = db.doc(`/posts/${req.params.postId}`);
  document
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return res.status(404).json({ error: "Post not found" });
      }

      if (doc.data().userHandle !== req.user.handle) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      // delete image in storage
      const imageUrl = doc.data().item.image;
      const imageName = imageUrl.match(/\/o\/(.*?)\?alt=media/)[1];

      return admin
        .storage()
        .bucket(config.storageBucket)
        .file(imageName)
        .delete();
    })
    .then(() => {
      return document.delete();
    })
    .then(() => {
      res.json({ message: "Post deleted successfully" });
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};

// disable a post
exports.disableItem = (req, res) => {
  const postDocument = db.collection("posts").doc(req.params.postId);
  let postData;

  postDocument
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return res.status(404).json({ error: "Post not found" });
      }

      if (doc.data().userHandle !== req.user.handle) {
        return res.status(403).json({ error: "Unauthorized access" });
      }

      if (!doc.data().isAvailable) {
        return res.status(400).json({ error: "Post already disabled" });
      }

      postData = doc.data();
      postData.postId = doc.id;
      postData.isAvailable = false;
      return postDocument.update({ isAvailable: false });
    })
    .then(() => {
      return res.json(postData);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ err: err.code });
    });
};

// enable a post
exports.enableItem = (req, res) => {
  const postDocument = db.collection("posts").doc(req.params.postId);
  let postData;

  postDocument
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return res.status(404).json({ error: "Post not found" });
      }

      if (doc.data().userHandle !== req.user.handle) {
        return res.status(403).json({ error: "Unauthorized access" });
      }

      if (doc.data().isAvailable) {
        return res.status(400).json({ error: "Post already enabled" });
      }
      postData = doc.data();
      postData.postId = doc.id;
      postData.isAvailable = true;
      return postDocument.update({ isAvailable: true });
    })
    .then(() => {
      return res.json(postData);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ err: err.code });
    });
};

// Upload an item image
exports.uploadItemImage = (req, res) => {
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
    let imgUri;
    admin
      .storage()
      .bucket(config.storageBucket)
      .upload(imageToBeUploaded.filepath, {
        resumable: false,
        metadata: { metadata: { contentType: imageToBeUploaded.mimetype } },
      })
      .then(() => {
        //without the 'alt=media' parameter the link is just gonna download the image instead of displaying it
        imgUri = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`;
        return res.json(imgUri);
      })
      .catch((err) => {
        console.error(err.code);
        return res.status(500).json({ image: "Please upload an image" });
      });
  });

  req.pipe(busboy); //rawBody is a property in every request object
};

// Get other user details
exports.getUserDetails = (req, res) => {
  let userData = {};

  db.doc(`/users/${req.params.handle}`)
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return res.status(404).json({ error: "User not found" });
      }
      userData.user = doc.data();
      // get the posts
      return db
        .collection("posts")
        .where("userHandle", "==", req.params.handle)
        .where("isAvailable", "==", true)
        .orderBy("createdAt", "desc")
        .get();
    })
    .then((data) => {
      userData.posts = [];

      data.forEach((doc) => {
        userData.posts.push({
          item: doc.data().item,
          categories: doc.data().categories,
          isAvailable: doc.data().isAvailable,
          createdAt: doc.data().createdAt,
          userHandle: doc.data().userHandle,
          userImage: doc.data().userImage,
          location: doc.data().location,
          postId: doc.id,
        });
      });

      return res.json(userData);
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};
