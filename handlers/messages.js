// Programmer Name     : Lim Wei Hau
// Program Name        : messages.js
// Description         : All the messages functions to handle api requests relevant to messages
// First Written on    : 20 December 2020
// Last Edited on      : 03 March 2021

const admin = require("firebase-admin");
const db = admin.firestore();

const userExist = (userMessages, userHandle) => {
  return (
    userMessages.findIndex(
      (msg) => msg.user && msg.user.handle === userHandle
    ) !== -1
  );
};

exports.getUserMessages = (req, res) => {
  db.collection("messages")
    .orderBy("createdAt", "desc")
    .get()
    .then((data) => {
      const userMessages = [];

      data.forEach((doc) => {
        if (doc.data().sender === req.user.handle) {
          const messageObject = {
            amSender: true,
            content: doc.data().content,
            createdAt: doc.data().createdAt,
            messageId: doc.id,
          };

          if (!userExist(userMessages, doc.data().recipient)) {
            userMessages.push({
              user: { handle: doc.data().recipient },
              messages: [messageObject],
            });
          } else {
            let handleIndex = userMessages.findIndex(
              (userMsg) => userMsg.user.handle === doc.data().recipient
            );
            userMessages[handleIndex].messages.push(messageObject);
          }
        } else if (doc.data().recipient === req.user.handle) {
          const messageObject = {
            amSender: false,
            content: doc.data().content,
            createdAt: doc.data().createdAt,
            seen: doc.data().seen,
            messageId: doc.id,
          };

          if (!userExist(userMessages, doc.data().sender)) {
            userMessages.push({
              user: { handle: doc.data().sender },
              messages: [messageObject],
            });
          } else {
            let handleIndex = userMessages.findIndex(
              (userMsg) => userMsg.user.handle === doc.data().sender
            );
            userMessages[handleIndex].messages.push(messageObject);
          }
        }
      });

      // fetch userImages and names
      return Promise.all(
        userMessages.map(async (userMessage) => {
          let userDoc = await db.doc(`/users/${userMessage.user.handle}`).get();
          let { fullName, imageUrl, expoPushToken } = userDoc.data();
          userMessage.user.fullName = fullName;
          userMessage.user.imageUri = imageUrl;
          userMessage.user.expoPushToken = expoPushToken;

          return userMessage;
        })
      );
    })
    .then((data) => {
      return res.json(data);
    })
    .catch((err) => {
      console.log(err);
      return res.status(500).json({ error: err.code });
    });
};

exports.readMessages = (req, res) => {
  db.collection("messages")
    .where("sender", "==", req.params.handle)
    .where("recipient", "==", req.user.handle)
    .get()
    .then((data) => {
      data.forEach((doc) => {
        if (req.query.createdAts.includes(doc.data().createdAt))
          db.doc(`/messages/${doc.id}`).update({ seen: true });
      });

      return res.status(200).json({});
    })
    .catch((err) => {
      console.log(err);
      return res.status(500).json({ error: err.code });
    });
};
