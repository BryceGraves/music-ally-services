const express = require('express');
const cors = require('cors');
const port = 8080;

const AWS = require('aws-sdk');
AWS.config.region = 'us-east-1';

const db = new AWS.DynamoDB();
const s3 = new AWS.S3({ apiVersion: '2006-03-01' });

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

      if (!resourceData[Genre.S]) {
        resourceData[Genre.S] = {};
      }

      if (!resourceData[Genre.S][Artist.S]) {
        resourceData[Genre.S][Artist.S] = {};
      }

      if (!resourceData[Genre.S][Artist.S][Album.S]) {
        resourceData[Genre.S][Artist.S][Album.S] = [];
      }

      resourceData[Genre.S][Artist.S][Album.S] = [
        ...resourceData[Genre.S][Artist.S][Album.S],
        {
          name: Song.S,
          key: Genre.S + '/' + Artist.S + '/' + Album.S + '/' + Song.S,
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

    const allGenreItems = data.Items.map((item) => item.Genre.S);
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
      ':Genre': {
        S: req.query.genre,
      },
    },
  };

  db.query(dynamoParams, (err, data) => {
    if (err) {
      console.log(err);
      return res.status(500).send({ message: err.message });
    }

    console.log('Raw Data: ', data);

    const queryFilteredByArtist = data.Items.map((item) => item.Artist.S);
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
      ':Artist': {
        S: req.query.artist,
      },
    },
  };

  db.query(dynamoParams, (err, data) => {
    if (err) {
      console.log(err);
      return res.status(500).send({ message: err.message });
    }

    console.log('Raw Data: ', data);

    const queryFilteredByAlbums = data.Items.map((item) => item.Album.S);
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
      ':Album': {
        S: req.query.album,
      },
    },
  };

  db.query(dynamoParams, (err, data) => {
    if (err) {
      console.log(err);
      return res.status(500).send({ message: err.message });
    }

    console.log('Raw Data: ', data);

    const songs = data.Items.map((item) => item.Song.S);

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
      ':Song': {
        S: req.query.song,
      },
    },
  };

  db.query(dynamoParams, (err, data) => {
    if (err) {
      console.log(err);
      return res.status(500).send({ message: err.message });
    }

    console.log('Raw Data: ', data);

    const databasePath = data.Items && data.Items.length > 0 ? data.Items[0].DatabasePath.S : null;

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
      Genre: { S: Genre },
      DatabasePath: { S: Genre + '/' + Artist + '/' + Album + '/' + Song },
      Artist: { S: Artist },
      Album: { S: Album },
      Song: { S: Song },
    },
  };

  db.putItem(dynamoParams, (err, data) => {
    if (err) {
      console.log('Error: ', err);
    } else {
      console.log('Success: ', data);
      res.status(200).send(data);
    }
  });
});

app.post('/updateSong', (req, res) => {
  const { songPath, newName } = req.body;

  const splitPath = songPath.split('/');
  const dynamoParams = {
    TableName: 'music',
    IndexName: 'SongIndex',
    KeyConditionExpression: 'Song = :Song',
    ExpressionAttributeValues: {
      ':Song': {
        S: req.query.song,
      },
    },
  };
});

app.listen(port, () => console.log(`Server be listening on port ${port}!`));
