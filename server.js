const express = require('express');
const cors = require('cors');
const port = 8080;

const AWS = require('aws-sdk');
AWS.config.region = 'us-east-1';
const db = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3({ apiVersion: '2006-03-01' });

const sqs = new AWS.SQS();

const app = express();
app.use(express.json());
app.use(cors());

app.get('/', (req, res) => {
  res.send("OWO what's this? A server?!");
});

app.get('/fetchSongs', (req, res) => {
  const dynamoParams = {
    TableName: 'music',
  };

  db.scan(dynamoParams, (err, data) => {
    if (err) {
      console.log(err);
      return res.status(500).send({ message: err.message });
    }

    console.log('Raw Data: ', data);

    let resourceData = {};
    data.Items.forEach((item) => {
      const { Genre, Artist, Album, Song } = item;

      if (!resourceData[Genre]) {
        resourceData[Genre] = {};
      }

      if (!resourceData[Genre][Artist]) {
        resourceData[Genre][Artist] = {};
      }

      if (!resourceData[Genre][Artist][Album]) {
        resourceData[Genre][Artist][Album] = [];
      }

      resourceData[Genre][Artist][Album] = [
        ...resourceData[Genre][Artist][Album],
        {
          name: Song,
          key: Genre + '/' + Artist + '/' + Album + '/' + Song,
        },
      ];
    });

    console.log('Processed Data: ', resourceData);

    return res.status(200).send(resourceData);
  });
});

app.get('/genres', (req, res) => {
  const dynamoParams = {
    TableName: 'music',
  };

  db.scan(dynamoParams, (err, data) => {
    if (err) {
      console.log(err);
      return res.status(500).send({ message: err.message });
    }

    console.log('Raw Data: ', data);

    const allGenreItems = data.Items.map((item) => item.Genre);
    const genres = [...new Set(allGenreItems)];

    console.log('Processed Data: ', genres);

    return res.status(200).send(genres);
  });
});

app.get('/artists/for/genre', (req, res) => {
  const dynamoParams = {
    TableName: 'music',
    KeyConditionExpression: 'Genre = :Genre',
    ExpressionAttributeValues: {
      ':Genre': req.query.genre,
    },
  };

  db.query(dynamoParams, (err, data) => {
    if (err) {
      console.log(err);
      return res.status(500).send({ message: err.message });
    }

    console.log('Raw Data: ', data);

    const queryFilteredByArtist = data.Items.map((item) => item.Artist);
    const artists = [...new Set(queryFilteredByArtist)];

    console.log('Processed Data: ', artists);

    return res.status(200).send(artists);
  });
});

app.get('/albums/for/artist', (req, res) => {
  const dynamoParams = {
    TableName: 'music',
    IndexName: 'ArtistIndex',
    KeyConditionExpression: 'Artist = :Artist',
    ExpressionAttributeValues: {
      ':Artist': req.query.artist,
    },
  };

  db.query(dynamoParams, (err, data) => {
    if (err) {
      console.log(err);
      return res.status(500).send({ message: err.message });
    }

    console.log('Raw Data: ', data);

    const queryFilteredByAlbums = data.Items.map((item) => item.Album);
    const albums = [...new Set(queryFilteredByAlbums)];

    console.log('Processed Data: ', albums);

    return res.status(200).send(albums);
  });
});

app.get('/songs/for/album', (req, res) => {
  const dynamoParams = {
    TableName: 'music',
    IndexName: 'AlbumIndex',
    KeyConditionExpression: 'Album = :Album',
    ExpressionAttributeValues: {
      ':Album': req.query.album,
    },
  };

  db.query(dynamoParams, (err, data) => {
    if (err) {
      console.log(err);
      return res.status(500).send({ message: err.message });
    }

    console.log('Raw Data: ', data);

    const songs = data.Items.map((item) => item.Song);

    console.log('Processed Data: ', songs);

    return res.status(200).send(songs);
  });
});

app.get('/song', (req, res) => {
  const dynamoParams = {
    TableName: 'music',
    IndexName: 'SongIndex',
    KeyConditionExpression: 'Song = :Song',
    ExpressionAttributeValues: {
      ':Song': req.query.song,
    },
  };

  db.query(dynamoParams, (err, data) => {
    if (err) {
      console.log(err);
      return res.status(500).send({ message: err.message });
    }

    console.log('Raw Data: ', data);

    const databasePath = data.Items && data.Items.length > 0 ? data.Items[0].DatabasePath : null;

    console.log('Processed Data: ', databasePath);

    const signedUrlPrams = {
      Bucket: 'bryce-graves',
      Key: databasePath,
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
});

app.post('/addSong', (req, res) => {
  const { Genre, Artist, Album, Song } = req.body;

  const dynamoParams = {
    TableName: 'music',
    Item: {
      Genre,
      DatabasePath: Artist + '/' + Album + '/' + Song,
      Artist,
      Album,
      Song,
    },
  };

  db.put(dynamoParams, (err, data) => {
    if (err) {
      console.log('Error: ', err);
    } else {
      console.log('Success: ', data);
      res.status(200).send(data);
    }
  });
});

app.post('/updateSong', (req, res) => {
  const { newPath, oldPath } = req.body;

  const splitNewPath = newPath.split('/');
  const splitOldPath = oldPath.split('/');

  const dynamoDeleteParams = {
    TableName: 'music',
    Key: {
      Genre: splitOldPath[0],
      DatabasePath: splitOldPath[1] + '/' + splitOldPath[2] + '/' + splitOldPath[3],
    },
  };

  const dynamoPutParams = {
    TableName: 'music',
    Item: {
      Genre: splitNewPath[0],
      DatabasePath: splitNewPath[1] + '/' + splitNewPath[2] + '/' + splitNewPath[3],
      Artist: splitNewPath[1],
      Album: splitNewPath[2],
      Song: splitNewPath[3],
    },
  };

  db.delete(dynamoDeleteParams, (err) => {
    if (err) {
      console.log('Error Deleting: ', err);
      res.status(500).send('Could not delete song entry');
    } else {
      db.put(dynamoPutParams, (err) => {
        if (err) {
          console.log('Error Putting: ', err);
          res.status(500).send('Could not add song entry');
        } else {
          res.status(200).send('Song Updated');
        }
      });
    }
  });
});

app.post('/play', (req, res) => {
  const { artist, album, song } = req.body;
  const body = {
    artist,
    album,
    song,
  };

  const sendMessageParams = {
    QueueUrl: 'https://sqs.us-east-1.amazonaws.com/576322095525/MusicAlly',
    MessageBody: JSON.stringify(body),
  };

  sqs.sendMessage(sendMessageParams, (err, data) => {
    if (err) {
      return res.status(500).send({ message: err.message });
    }

    return res.status(200).send('Song queued');
  });
});

app.listen(port, () => console.log(`Server be listening on port ${port}!`));
