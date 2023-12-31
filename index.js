require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
const port = process.env.PORT;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }
  // bearer token
  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.kw0dksl.mongodb.net/?retryWrites=true&w=majority`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection

    const usersCollection = client.db("summer-school").collection("users");
    const classesCollection = client.db("summer-school").collection("classes");
    const cartCollection = client.db("summer-school").collection("carts");
    const enrollCollection = client.db("summer-school").collection("enroll");

    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "48h",
      });

      res.send({ token });
    });

    // user related api..........................................
    // get users form db
    app.get("/users", async (req, res) => {
      const { role, sort } = req.query;
      const query = role ? { role: role } : {};
    
      let result;
      if (role === "instructor" && sort === "1") {
        result = await usersCollection
          .find(query)
          .sort({ enrolledStudents: -1 }) // Sort in descending order by enrolledStudents
          .toArray();
      } else {
        result = await usersCollection.find(query).toArray();
      }
    
      res.send(result);
    });
    

    // add users to db
    app.post("/users", async (req, res) => {
      // inserting user in the db after signup
      const user = {
        ...req.body,
        role: "student",
      };
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // security layer: verifyJWT
    // email same
    // check role

    app.get("/users/role/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ role: false });
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { role: user?.role };
      res.send(result);
    });

    app.patch("/users/:role/:id", async (req, res) => {
      const id = req.params.id;
      const newRole = req.params.role;
      // console.log(id);
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: newRole,
        },
      };

      // adding new element in db
      if (newRole == "instructor") {
        updateDoc.$set.enrolledStudents = 0;
      }

      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    //.........................................................
    // Class api

    // get all Classes
    app.get("/class", async (req, res) => {
      const { state, popular } = req.query;
      const query = state ? { state: state } : {};

      let result;
      if (popular === "1") {
        result = await classesCollection
          .find(query)
          .sort({ enrolledStudents: -1 }) // Sort in descending order by enrolledStudents
          .toArray();
      } else {
        result = await classesCollection.find(query).toArray();
      }

      res.send(result);
    });

    // Add Class
    app.post("/class", async (req, res) => {
      const newItem = req.body;
      const result = await classesCollection.insertOne(newItem);
      res.send(result);
    });

    // update class status
    app.patch("/class-state/:state/:id", async (req, res) => {
      const id = req.params.id;
      const newState = req.params.state;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          state: newState,
        },
      };
      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // update class feedback
    app.patch("/class-feedback/:feedback/:id", async (req, res) => {
      const id = req.params.id;
      const newFeedback = req.params.feedback;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          feedback: newFeedback,
        },
      };
      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    //.........................................................

    // cart collection apis
    app.get("/carts", async (req, res) => {
      const email = req.query.email;

      if (!email) {
        res.send([]);
      }

      // const decodedEmail = req.decoded.email;
      // if (email !== decodedEmail) {
      //   return res
      //     .status(403)
      //     .send({ error: true, message: "provider access" });
      // }

      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/carts", async (req, res) => {
      const item = req.body;
      // console.log(item);
      const result = await cartCollection.insertOne(item);
      res.send(result);
    });

    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });

    //.........................................................
    // Payment
    app.delete("/pay/:id/:classID/:myEmail", async (req, res) => {
      // try {
      const id = req.params.id;
      const classID = req.params.classID;
      const email = req.params.myEmail;

      const classObj = await classesCollection.findOne({
        _id: new ObjectId(classID),
      });
      console.log(classObj);
      const authorObj = await usersCollection.findOne({
        email: classObj.email,
      });

      console.log(classObj, authorObj);

      if (!classObj) {
        return res.status(404).send({ message: "Class not found" });
      }

      // updating class seat & enroll count
      const filter = { _id: new ObjectId(classObj._id) };
      const updateDoc = {
        $set: {
          seats: classObj.seats - 1,
          enrolledStudents: classObj.enrolledStudents + 1,
        },
      };
      await classesCollection.updateOne(filter, updateDoc);

      // updating author enroll count
      const filter1 = { _id: new ObjectId(authorObj._id) };
      const updateDoc1 = {
        $set: {
          enrolledStudents: authorObj.enrolledStudents + 1,
        },
      };
      await usersCollection.updateOne(filter1, updateDoc1);

      // Create the document to be inserted into enrollCollection
      const enrollDoc = {
        email: email,
        name: classObj.name,
        price: classObj.price,
        image: classObj.image,
      };

      // Insert the document into enrollCollection
      await enrollCollection.insertOne(enrollDoc);

      // deleting operation
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);

      if (result.deletedCount === 0) {
        return res.status(404).send({ message: "Item not found in cart" });
      }

      res.send(result);

      // } catch (error) {
      //   console.log(error);
      //   res.status(500).send({ message: "Internal server error" });
      // }
    });
    //.........................................................
    // enrolled

    app.get("/enroll", async (req, res) => {
      const { email } = req.query;
      const query = email ? { email: email } : {};

      const result = await enrollCollection.find(query).toArray();
      result.reverse();
      res.send(result);
    });
    //.........................................................

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Summer School is Running");
});

app.listen(port, () => {
  console.log(`Summer School is sitting on port ${port}`);
});
