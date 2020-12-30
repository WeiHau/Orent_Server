const admin = require("firebase-admin");
const db = admin.firestore();

const config = require("../util/config");

const { validatePost } = require("../util/validators");

// Get all posts
// fetch based on search
// fetch based on category
// fetch based on price
// https://stackoverflow.com/questions/48036975/firestore-multiple-conditional-where-clauses (this may help)
exports.getAllPosts = (req, res) => {
  let postRef = db.collection("posts").where("isAvailable", "==", true);
  if (req.query.hideOwnPosts === "true")
    postRef = postRef.where("userHandle", "!=", req.user.handle);

  // if (req.query.search) {
  //   // user searched
  //   const searchText = decodeURIComponent(req.query.search);

  //   postRef = postRef
  //     .where("item.name", ">=", searchText)
  //     .where("item.name", "<=", searchText + "~"); // '\uf8ff' equals '~'
  // }

  postRef.get().then((data) => {
    let posts = [];

    let searchText = "";
    if (req.query.search) searchText = decodeURIComponent(req.query.search);

    let categoriesArr;
    if (req.query.categories)
      categoriesArr = decodeURIComponent(req.query.categories).split(",");

    data.forEach((doc) => {
      // filter search
      if (
        searchText &&
        !doc.data().item.name.includes(searchText) &&
        !doc.data().item.description.includes(searchText)
      )
        return;

      // filter categorize
      if (
        categoriesArr &&
        !categoriesArr.every((category) =>
          doc.data().item.categories.includes(category)
        )
      )
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
    posts = posts.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

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

      itemDetail = { ...doc.data() };

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
exports.getPosts = (req, res) => {
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

  if (!valid) return res.status(400).json(errors);

  const newPost = {
    item: req.body,
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

      admin.storage().bucket(config.storageBucket).file(imageName).delete();
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

      return postDocument.update({ isAvailable: false });
    })
    .then(() => {
      return res.json({ message: "Post disabled" });
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ err: err.code });
    });
};

// enable a post
exports.enableItem = (req, res) => {
  const postDocument = db.collection("posts").doc(req.params.postId);

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

      return postDocument.update({ isAvailable: true });
    })
    .then(() => {
      return res.json({ message: "Post enabled" });
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
      Math.random() * 10000000000
    )}.${imageExtension}`;
    const filepath = path.join(os.tmpdir(), imageFileName);

    imageToBeUploaded = { filepath, mimetype };
    file.pipe(fs.createWriteStream(filepath));
  });

  //after uploaded the file
  busboy.on("finish", () => {
    let imgUrl;
    admin
      .storage()
      .bucket(config.storageBucket)
      .upload(imageToBeUploaded.filepath, {
        resumable: false,
        metadata: { metadata: { contentType: imageToBeUploaded.mimetype } },
      })
      .then(() => {
        //without the 'alt=media' parameter the link is just gonna download the image instead of displaying it
        imgUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`;
        return res.json(imgUrl);
      })
      .catch((err) => {
        console.error(err);
        return res.status(500).json({ error: err.code });
      });
  });

  req.pipe(busboy); //rawBody is a property in every request object
};
