const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const cors = require('cors');
const cheerio = require('cheerio');

const app = express();
const cache = {};
const cacheDuration = 7*24*3600000; 
const Port = process.env.PORT || 5000;
app.use(cors());

app.get('/leetcode/:username', async(req, res) => {
  const { username } = req.params;
  const profileUrl = `https://leetcode.com/${username}`;
  
  if (cache[username] && (Date.now() - cache[username].timestamp) < cacheDuration) {
    return res.json(cache[username].data);
  }

  try {
    const graphqlQuery = {
      query: `
        query userProfileInfo($username: String!) {
          matchedUser(username: $username) {
            username
            submitStats: submitStatsGlobal {
              acSubmissionNum {
                difficulty
                count
              }
            }
          }
          userContestRanking(username: $username) {
            rating
            attendedContestsCount
          }
        }
      `,
      variables: { username }
    };

    const response = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Referer': 'https://leetcode.com',
      },
      body: JSON.stringify(graphqlQuery),
    });

    const data = await response.json();
    
  
    
    if (!data.data) {
      return res.status(404).json({ error: 'User not found or API response format changed' });
    }

    let totalSolved = 0;
    if (data.data.matchedUser && 
        data.data.matchedUser.submitStats && 
        data.data.matchedUser.submitStats.acSubmissionNum) {
  
      const allDifficulty = data.data.matchedUser.submitStats.acSubmissionNum.find(
        item => item.difficulty === "All"
      );
      
      if (allDifficulty) {
        totalSolved = allDifficulty.count;
      } else {
        totalSolved = data.data.matchedUser.submitStats.acSubmissionNum.reduce(
          (sum, item) => sum + item.count, 0
        );
      }
    }

    const contestRating = data.data.userContestRanking ? data.data.userContestRanking.rating : null;
    
    const userData = {
      username,
      totalSolved,
      contestRating,
      profileUrl
    };

    cache[username] = {
      data: userData,
      timestamp: Date.now(),
    };
    
    res.json(userData);
  } catch (err) {
    console.error('LeetCode API Error:', err);
    res.status(500).json({ error: 'Failed to fetch LeetCode data: ' + err.message });
  }
});
app.get('/codechef/:username', async (req, res) => {
  const { username } = req.params;
  const profileUrl = `https://www.codechef.com/users/${username}`;

  // Check cache
  if (cache[username] && (Date.now() - cache[username].timestamp) < cacheDuration) {
    return res.json(cache[username].data);
  }
  
  try {
    const response = await fetch(profileUrl);
    const html = await response.text();
    const $ = cheerio.load(html);

    const currentRating = $('.rating-number').first().text().trim();
    const maxRating = $('.rating-header small').first().text().match(/\d+/)?.[0];

    if (!currentRating) {
      return res.status(404).json({ error: 'User not found or page layout changed' });
    }

    const userData = {
      username,
      rating: parseInt(currentRating),
      maxRating: parseInt(maxRating),
      profileUrl,
    };

    cache[username] = {
      data: userData,
      timestamp: Date.now(),
    };

    res.json(userData);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch CodeChef data' });
  }
});

app.listen(Port, () => {
  console.log(`Server is running on port ${Port}`);
});