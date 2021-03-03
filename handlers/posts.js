// Programmer Name     : Lim Wei Hau
// Program Name        : posts.js
// Description         : All the posts functions to handle api requests relevant to posts
// First Written on    : 20 December 2020
// Last Edited on      : 03 March 2021

const admin = require("firebase-admin");
const db = admin.firestore();

const config = require("../util/config");

const { validatePost } = require("../util/validators");

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
      if (minPrice && item.price < minPrice) return;
      if (maxPrice && item.price > maxPrice) return;

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
      if (!doc.exists) throw res.status(404).json({ error: "Post not found" });

      itemDetail = doc.data();
      itemDetail.postId = doc.id;

      return db.doc(`/users/${itemDetail.userHandle}`).get();
    })
    .then((doc) => {
      if (!doc.exists) throw res.status(404).json({ error: "User not found" });

      itemDetail.userImage = doc.data().imageUrl;
      itemDetail.userContact = doc.data().contact;

      return res.json(itemDetail);
    })
    .catch((err) => {
      return err;
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

      // adding postId to each doc
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
      // console.error(err);
      return res.status(500).json({ error: err.code });
    });
};

// post an item
exports.postAnItem = (req, res) => {
  let { valid, errors } = validatePost(req.body);
  if (!valid) return res.status(400).json(errors);

  const newPost = {
    item: {
      ...req.body,
      price: Math.floor(req.body.price * 100) / 100,
    },
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
    item: { ...req.body, price: Math.floor(req.body.price * 100) / 100 },
  };

  const document = db.doc(`/posts/${req.params.postId}`);

  const updateDocument = () => {
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
  };

  const deletePostImage = () => {
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

  db.collection("rentalActivities")
    .where("postId", "==", req.params.postId)
    .get()
    .then((data) => {
      console.log(data);
      let editable = true;
      data.forEach((doc) => {
        editable = false;
      });

      if (!editable) {
        return res.status(400).json({
          action: "uneditable",
        });
      } else {
        deletePostImage();
      }
    });
};

// delete a post
exports.deletePost = (req, res) => {
  const deleteDocument = () => {
    const document = db.doc(`/posts/${req.params.postId}`);
    document
      .get()
      .then((doc) => {
        if (!doc.exists)
          throw res.status(404).json({ error: "Post not found" });

        if (doc.data().userHandle !== req.user.handle)
          throw res.status(403).json({ error: "Unauthorized" });

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
        return res.json({ message: "Post deleted successfully" });
      })
      .catch((err) => {
        // console.error(err);
        return err;
        //return res.status(500).json({ error: err.code });
      });
  };

  // (if exist in rental activities, cant delete)

  db.collection("rentalActivities")
    .where("postId", "==", req.params.postId)
    .get()
    .then((data) => {
      let deletable = true;
      data.forEach((doc) => {
        deletable = false;
      });

      if (!deletable) {
        return res.status(400).json({
          action: "undeletable",
        });
      } else {
        deleteDocument();
      }
    });
};

// disable a post
exports.disableItem = (req, res) => {
  const postDocument = db.collection("posts").doc(req.params.postId);
  let postData;

  postDocument
    .get()
    .then((doc) => {
      if (!doc.exists) throw res.status(404).json({ error: "Post not found" });

      if (doc.data().userHandle !== req.user.handle)
        throw res.status(403).json({ error: "Unauthorized access" });

      if (!doc.data().isAvailable)
        throw res.status(400).json({ error: "Post already disabled" });

      postData = doc.data();
      postData.postId = doc.id;
      postData.isAvailable = false;
      return postDocument.update({ isAvailable: false });
    })
    .then(() => {
      return res.json(postData);
    })
    .catch((err) => {
      // console.error(err);
      return err;
    });
};

// enable a post
exports.enableItem = (req, res) => {
  const postDocument = db.collection("posts").doc(req.params.postId);
  let postData;

  postDocument
    .get()
    .then((doc) => {
      if (!doc.exists) throw res.status(404).json({ error: "Post not found" });

      if (doc.data().userHandle !== req.user.handle)
        throw res.status(403).json({ error: "Unauthorized access" });

      if (doc.data().isAvailable)
        throw res.status(400).json({ error: "Post already enabled" });

      postData = doc.data();
      postData.postId = doc.id;
      postData.isAvailable = true;
      return postDocument.update({ isAvailable: true });
    })
    .then(() => {
      return res.json(postData);
    })
    .catch((err) => {
      //console.error(err);
      return err;
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
      Math.random() * 1000000000000000
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
        //console.error(err.code);
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
      if (!doc.exists) throw res.status(404).json({ error: "User not found" });

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
      //console.error(err);
      return err;
    });
};

// send a rental request
exports.sendRentalRequest = (req, res) => {
  // return response only

  const requestObject = {
    renter: req.user.handle,
    owner: req.body.handle,
    postId: req.body.postId,
    startDate: req.body.startDate,
    endDate: req.body.endDate,
    totalCost: req.body.totalCost,
    approval: "pending",
    createdAt: new Date().toISOString(),
  };

  db.doc(`/posts/${req.body.postId}`)
    .get()
    .then((doc) => {
      if (!doc.exists) return res.status(404).json({ error: "post not found" });
      else {
        db.collection("rentalActivities")
          .add(requestObject)
          .then((doc) => {
            const resReq = requestObject;
            resReq.requestId = doc.id;
            res.json(resReq);
          })
          .catch((err) => {
            res.status(500).json({ error: "something went wrong" });
            console.error(err);
          });
      }
    });
};

// fetch rental requests (approval: 'pending)
exports.getRentalRequests = (req, res) => {
  // return response only

  db.collection("rentalActivities")
    .where("approval", "==", "pending")
    .orderBy("createdAt", "desc")
    .get()
    .then((data) => {
      const rentalRequests = [];

      let todayDate = new Date();
      data.forEach((doc) => {
        // (remove if endDate have passed)
        let requestEndDate = new Date(doc.data().endDate);
        if (
          requestEndDate.setHours(0, 0, 0, 0) < todayDate.setHours(0, 0, 0, 0)
        ) {
          // endDate have passed
          db.doc(`/rentalActivities/${doc.id}`).delete();
          return;
        }

        if (doc.data().renter === req.user.handle) {
          rentalRequests.push({
            requestId: doc.id,
            amRenter: true,
            post: { postId: doc.data().postId },
            user: { handle: doc.data().owner },
            startDate: doc.data().startDate,
            endDate: doc.data().endDate,
            totalCost: doc.data().totalCost,
            createdAt: doc.data().createdAt,
          });
        } else if (doc.data().owner === req.user.handle) {
          rentalRequests.push({
            requestId: doc.id,
            amRenter: false,
            post: { postId: doc.data().postId },
            user: { handle: doc.data().renter },
            startDate: doc.data().startDate,
            endDate: doc.data().endDate,
            totalCost: doc.data().totalCost,
            createdAt: doc.data().createdAt,
          });
        }
      });

      return Promise.all(
        rentalRequests.map(async (rentalRequest) => {
          let userDoc = await db
            .doc(`/users/${rentalRequest.user.handle}`)
            .get();
          let postDoc = await db
            .doc(`/posts/${rentalRequest.post.postId}`)
            .get();

          let { fullName, imageUrl } = userDoc.data();
          rentalRequest.user.fullName = fullName;
          rentalRequest.user.imageUri = imageUrl;

          if (!postDoc.exists) return;
          let { image, name } = postDoc.data().item;
          rentalRequest.post.image = image;
          rentalRequest.post.title = name;

          return rentalRequest;
        })
      );
    })
    .then((data) => {
      return res.json(data);
    })
    .catch((err) => {
      res.status(500).json({ error: "something went wrong" });
      console.error(err);
    });
};

// fetch rental activities (approval: 'approved')
exports.getRentalActivities = (req, res) => {
  // return response only

  db.collection("rentalActivities")
    .where("approval", "==", "approved")
    .orderBy("createdAt", "desc")
    .get()
    .then((data) => {
      const rentalRequests = [];
      let todayDate = new Date();
      data.forEach((doc) => {
        // (remove if endDate have passed)
        let requestEndDate = new Date(doc.data().endDate);
        requestEndDate.setDate(requestEndDate.getDate() + 7);
        if (
          requestEndDate.setHours(0, 0, 0, 0) < todayDate.setHours(0, 0, 0, 0)
        ) {
          // endDate have passed a week
          db.doc(`/rentalActivities/${doc.id}`).delete();
          return;
        }

        if (doc.data().renter === req.user.handle) {
          rentalRequests.push({
            activityId: doc.id,
            amRenter: true,
            post: { postId: doc.data().postId },
            user: { handle: doc.data().owner },
            startDate: doc.data().startDate,
            endDate: doc.data().endDate,
            totalCost: doc.data().totalCost,
            createdAt: doc.data().createdAt,
          });
        } else if (doc.data().owner === req.user.handle) {
          rentalRequests.push({
            activityId: doc.id,
            amRenter: false,
            post: { postId: doc.data().postId },
            user: { handle: doc.data().renter },
            startDate: doc.data().startDate,
            endDate: doc.data().endDate,
            totalCost: doc.data().totalCost,
            createdAt: doc.data().createdAt,
          });
        }
      });

      return Promise.all(
        rentalRequests.map(async (rentalRequest) => {
          let userDoc = await db
            .doc(`/users/${rentalRequest.user.handle}`)
            .get();
          let postDoc = await db
            .doc(`/posts/${rentalRequest.post.postId}`)
            .get();

          let { fullName, imageUrl } = userDoc.data();
          rentalRequest.user.fullName = fullName;
          rentalRequest.user.imageUri = imageUrl;

          if (!postDoc.exists) return;

          let { image, name } = postDoc.data().item;
          rentalRequest.post.image = image;
          rentalRequest.post.title = name;

          return rentalRequest;
        })
      );
    })
    .then((data) => {
      return res.json(data);
    })
    .catch((err) => {
      res.status(500).json({ error: "something went wrong" });
      console.error(err);
    });
};

// approve rental request
exports.approveRentalRequest = (req, res) => {
  const requestDoc = db
    .collection("rentalActivities")
    .doc(req.params.requestId);

  requestDoc
    .get()
    .then((doc) => {
      if (!doc.exists)
        throw res.status(404).json({ error: "Request not found" });

      if (doc.data().owner !== req.user.handle)
        throw res.status(403).json({ error: "Unauthorized access" });

      if (doc.data().approval === "approved")
        throw res.status(400).json({ error: "Request already approved" });

      return requestDoc.update({ approval: "approved" });
    })
    .then(() => {
      return res.json({});
    })
    .catch((err) => {
      //console.error(err);
      return err;
    });
};

// reject/delete rental request
exports.removeRentalRequest = (req, res) => {
  const requestDoc = db
    .collection("rentalActivities")
    .doc(req.params.requestId);

  requestDoc
    .get()
    .then((doc) => {
      if (!doc.exists)
        throw res.status(404).json({ error: "Request not found" });

      if (doc.data().approval === "approved")
        throw res
          .status(400)
          .json({ error: "Cant reject/delete an approved request" });

      if (
        doc.data().owner !== req.user.handle &&
        doc.data().renter !== req.user.handle
      )
        throw res.status(403).json({ error: "Unauthorized access" });

      return requestDoc.delete();
    })
    .then(() => {
      return res.json({});
    })
    .catch((err) => {
      //console.error(err);
      return err;
    });
};
