const { db, admin } = require("../utility/admin")

const config = require("../utility/config")

const firebase = require("firebase")
firebase.initializeApp(config)

const {
  validateSignupData,
  validateLoginData,
  reduceUserDetails
} = require("../utility/validators")

exports.signup = (req, res) => {
  const newUser = {
    email: req.body.email,
    password: req.body.password,
    confirmPassword: req.body.confirmPassword
  }

  const { valid, errors } = validateSignupData(newUser)

  if (!valid) return res.status(400).json(errors)

  const noImage = "no-img.png"

  let token, userId
  firebase
    .auth()
    .createUserWithEmailAndPassword(newUser.email, newUser.password)
    .then(data => {
      userId = data.user.uid
      return data.user.getIdToken()
    })
    .then(idToken => {
      token = idToken
      const userCredentials = {
        email: newUser.email,
        createdAt: new Date().toISOString(),
        imageUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${noImage}?alt=media`,
        userId
      }
      return db.doc(`/users/${userId}`).set(userCredentials)
    })
    .then(() => {
      return res.status(201).json({ token })
    })
    .catch(err => {
      console.error(err)
      if (err.code === "auth/email-already-in-use") {
        return res.status(400).json({ email: `email is already in use` })
      } else {
        return res.status(500).json({ error: err.code })
      }
    })
}

exports.login = (req, res) => {
  const user = {
    email: req.body.email,
    password: req.body.password
  }

  const { valid, errors } = validateLoginData(user)

  if (!valid) return res.status(400).json(errors)

  firebase
    .auth()
    .signInWithEmailAndPassword(user.email, user.password)
    .then(data => {
      return data.user.getIdToken()
    })
    .then(token => {
      return res.json({ token })
    })
    .catch(err => {
      console.log(err)
      if (err.code === "auth/wrong-password") {
        return res
          .status(403)
          .json({ general: "wrong credentials please try again" })
      }
      return res.status(500).json({ error: err.code })
    })
}

// user details
exports.addUserDetails = (req, res) => {
  let userDetails = reduceUserDetails(req.body)

  db.doc(`/users/${req.user.uid}`)
    .update(userDetails)
    .then(() => {
      return res.json({ message: "Details added successfully" })
    })
    .catch(err => {
      console.error(err)
      return res.status(500).json({ error: err.code })
    })
}

// get own user details
exports.getAuthenticatedUser = (req, res) => {
  let userData = {}
  db.doc(`users/${req.user.uid}`)
    .get()
    .then(doc => {
      if (doc.exists) {
        userData.user = doc.data()
        return db
          .collection("jobs")
          .where("userId", "==", req.user.uid)
          .orderBy("createdAt", "desc")
          .get()
      } else {
        return res.status(404).json({ errror: "User not found" })
      }
    })
    .then(data => {
      userData.jobs = []
      data.forEach(doc => {
        userData.jobs.push({
          userId: doc.data().userId,
          company: doc.data().company,
          position: doc.data().position,
          status: doc.data().status,
          link: doc.data().link,
          createdAt: doc.data().createdAt,
          jobId: doc.id
        })
      })
      return res.json(userData)
    })
    .catch(err => {
      console.error(err)
      return res.status(500).json({ error: err.code })
    })
}

// get all users details
exports.getAllUsers = (req, res) => {
  db.collection("users")
    .get()
    .then(data => {
      let users = []
      data.forEach(doc => {
        users.push(doc.data())
      })
      return res.json(users)
    })
    .catch(err => console.error(err))
}

exports.uploadImage = (req, res) => {
  const BusBoy = require("busboy")
  const path = require("path")
  const os = require("os")
  const fs = require("fs")

  const busboy = new BusBoy({ headers: req.headers })

  let imageToBeUploaded = {}
  let imageFileName

  busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
    if (mimetype !== `image/jpeg` && mimetype !== `image/png`) {
      return res.status(400).json({ error: "wrong file type submitted" })
    }
    console.log(fieldname, file, filename, encoding, mimetype)
    if (mimetype !== "image/jpeg" && mimetype !== "image/png") {
      return res.status(400).json({ error: "Wrong file type submitted" })
    }
    // my.image.png => ['my', 'image', 'png']
    const imageExtension = filename.split(".")[filename.split(".").length - 1]
    // 32756238461724837.png
    imageFileName = `${Math.round(
      Math.random() * 1000000000000
    ).toString()}.${imageExtension}`
    const filepath = path.join(os.tmpdir(), imageFileName)
    imageToBeUploaded = { filepath, mimetype }
    file.pipe(fs.createWriteStream(filepath))
  })
  busboy.on("finish", () => {
    admin
      .storage()
      .bucket(config.storageBucket)
      .upload(imageToBeUploaded.filepath, {
        resumable: false,
        metadata: {
          metadata: {
            contentType: imageToBeUploaded.mimetype
          }
        }
      })
      .then(() => {
        const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`
        return db.doc(`/users/${req.user.uid}`).update({ imageUrl })
      })
      .then(() => {
        return res.json({ message: "image uploaded successfully" })
      })
      .catch(err => {
        console.error(err)
        return res.status(500).json({ error: "something went wrong" })
      })
  })
  busboy.end(req.rawBody)
}