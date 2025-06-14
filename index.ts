const express = require("express");
const axios = require("axios");
const app = express();

app.get("/get-directions", async (req, res) => {
  const { start, goal } = req.query;

  const [originX, originY] = start.split(",");
  const [destX, destY] = goal.split(",");

  const url = "https://apis-navi.kakaomobility.com/v1/directions";
  const headers = {
    Authorization: `KakaoAK ${process.env.KAKAO_API_KEY}`,
  };

  try {
    const response = await axios.get(url, {
      params: {
        origin: `${originX},${originY}`,
        destination: `${destX},${destY}`,
      },
      headers,
    });

    res.status(200).json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.message,
      details: error.response?.data || null,
    });
  }
});

module.exports = app;
