const express = require('express');
const cors = require('cors');
const mm = require('music-metadata');
const multer = require('multer');
const app = express();
const upload = multer();
const port = 8080;

const AWS = require('aws-sdk');
AWS.config.region = 'us-east-1';

var sts = new AWS.STS();
sts.assumeRole(
  {
    RoleArn: 'arn:aws:iam::576322095525:role/bryce',
    RoleSessionName: 'music-ally-server',
  },
  (err, data) => {
    if (err) {
      // an error occurred
      console.log('Cannot assume role');
      console.log(err, err.stack);
    } else {
      // successful response
      AWS.config.update({
        accessKeyId: data.Credentials.AccessKeyId,
        secretAccessKey: data.Credentials.SecretAccessKey,
        sessionToken: data.Credentials.SessionToken,
      });
    }
  }
);

app.use(express.json());
app.use(cors());

app.get('/fetchSongs/:id', (req, res) => {
  const s3 = new AWS.S3({ apiVersion: '2006-03-01' });

  console.log(req.params.id);

  const getParams = {
    Bucket: 'bryce-graves',
    Prefix: req.params.id,
  };

  // TODO: get role for these? Or stick with using a user

  s3.listObjectsV2(getParams, (err, data) => {
    if (err) {
      console.log(err, err.stack);
    } else {
      Promise.all(
        data.Contents.map((bucketResource) => {
          const [, artist, album, title] = bucketResource.Key.split('/');
          return { artist, album, title };
        })
      ).then((resourceArray) => {
        let resourceData = {};
        resourceArray.forEach((resource) => {
          const tempData = {};
          const {
            artist = resource.artist || 'Unknown',
            album = resource.album || 'Unknown',
            title = resource.title || 'Unknown',
          } = resource;

          tempData[artist] = {};
          tempData[artist][album] = [
            {
              name: title,
              url: req.params.id + '/' + artist + '/' + album + '/' + title,
            },
          ];

          resourceData = { ...resourceData, ...tempData };
        });
        res.send(resourceData);
      });
    }
  });
});

app.get('/fetchSong/');

app.post('/upload', upload.array(), (req, res, next) => {
  console.log('Main Body: ', req.body);
  console.log(req.readable);
  res.send('Success');
});

app.post('/update', (req, res) => {
  const s3 = new AWS.S3({ apiVersion: '2006-03-01' });
  const splitPath = songPath.split('/');
  const copyPath = splitPath[0] + '/' + splitPath[1] + '/' + splitPath[2] + '/' + newName;
  const copyParams = {
    Bucket: 'bryce-graves',
    CopySource: '/bryce-graves/' + songPath,
    Key: copyPath,
  };
  const deleteParams = {
    Bucket: 'bryce-graves',
    Key: songPath,
  };
  s3.copyObject(copyParams)
    .promise()
    .then(() => {
      s3.deleteObject(deleteParams).promise();
    });
  dispatch(songUpdate(splitPath, newName));
});

app.listen(port, () => console.log(`Server be listening on port ${port}!`));
