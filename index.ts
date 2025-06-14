const express = require("express");
const axios = require("axios");
const app = express();

// 1️⃣ 경로 안내 (Kakao Mobility)
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

// 2️⃣ 정적 지도 이미지 (Kakao Static Map)
app.get("/get-map-image", async (req, res) => {
  const { start, goal } = req.query;

  if (!start || !goal) {
    return res.status(400).json({ error: "start and goal are required" });
  }

  const [startX, startY] = start.split(",");
  const [goalX, goalY] = goal.split(",");

  const url = "https://dapi.kakao.com/v2/maps/staticmap";
  const headers = {
    Authorization: `KakaoAK ${process.env.KAKAO_API_KEY}`,
  };

  const params = {
    width: 600,
    height: 400,
    markers: `color:blue|label:S|${startX},${startY}|color:red|label:G|${goalX},${goalY}`,
  };

  try {
    const queryString = new URLSearchParams(params).toString();
    const imageUrl = `${url}?${queryString}`;
    res.json({ imageUrl });
  } catch (error) {
    res.status(500).json({ error: "Failed to generate map image" });
  }
});

// 3️⃣ 주소 → 좌표 (Geocoding)
app.get("/geocode", async (req, res) => {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ error: "query is required" });
  }

  const url = "https://dapi.kakao.com/v2/local/search/address.json";
  const headers = {
    Authorization: `KakaoAK ${process.env.KAKAO_API_KEY}`,
  };

  try {
    const response = await axios.get(url, {
      params: { query },
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

// Local development (optional)
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

module.exports = app;
