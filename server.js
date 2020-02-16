const express = require('express');
const cors = require('cors');
const mm = require('music-metadata');
const uuid = require('uuid');
const multer = require('multer');
const app = express();
const upload = multer();
const port = 8080;

const AWS = require('aws-sdk');
AWS.config.region = 'us-east-1';

const s3 = new AWS.S3({ apiVersion: '2006-03-01' });

app.use(express.json());
app.use(cors());

app.get('/fetchSongs/:id', (req, res) => {
  const id = req.params.id;
  const getParams = {
    Bucket: 'bryce-graves',
    Prefix: id,
  };

  s3.listObjectsV2(getParams, (err, data) => {
    if (err) {
      console.log(err, err.stack);
    } else {
      Promise.all(
        data.Contents.map((bucketResource) => {
          const [, artist, album, title] = bucketResource.Key.split('/');
          return { artist, album, title };
        })
      )
        .then((resourceArray) => {
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
                key: id + '/' + artist + '/' + album + '/' + title,
              },
            ];

            resourceData = { ...resourceData, ...tempData };
          });
          res.send(resourceData);
        })
        .catch((err) => {
          console.log('Failed fetching songs: ', err);
          res.status(500).send('Failed fetching songs');
        });
    }
  });
});

app.get('/fetchSong/:id/:artist/:album/:song', (req, res) => {
  const { id, artist, album, song } = req.params;
  const signedUrlPrams = {
    Bucket: 'bryce-graves',
    Key: id + '/' + artist + '/' + album + '/' + song,
    Expires: 60 * 60,
  };

  s3.getSignedUrlPromise('getObject', signedUrlPrams)
    .then((signedUrl) => {
      res.send(signedUrl);
    })
    .catch((err) => {
      console.log('Failed fetching signed url: ', err);
      res.status(500).send('Failed fetching signed url');
    });
});

app.post('/upload', upload.array(), (req, res, next) => {
  console.log('Main Body: ', req.body);
  console.log(req.readable);
  res.send('Success');
});

app.post('/updateSong', (req, res) => {
  const { songPath, newName } = req.body;

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
      s3.deleteObject(deleteParams)
        .promise()
        .then(() => {
          res.send('Success');
        })
        .catch((err) => {
          console.log('Failed to delete song: ', err);
          res.status(500).send('Failed to delete song');
        });
    })
    .catch((err) => {
      console.log('Failed updating song: ', err);
      res.status(500).send('Failed updating song');
    });
});

app.listen(port, () => console.log(`Server be listening on port ${port}!`));
