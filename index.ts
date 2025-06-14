const express = require("express");
const axios = require("axios");
const app = express();

// ✅ Kakao 길찾기 API
app.get("/get-directions", async (req, res) => {
  const { start, goal } = req.query;

  if (!start || !goal) {
    return res.status(400).json({ error: "start and goal are required" });
  }

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

// ✅ Kakao 정적 지도 이미지 API
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
    markers: `${startX},${startY}|${goalX},${goalY}`,
  };

  try {
    const queryString = new URLSearchParams(params).toString();
    const imageUrl = `${url}?${queryString}`;
    res.status(200).json({ imageUrl });
  } catch (error) {
    res.status(500).json({ error: "Failed to generate map image" });
  }
});

// ✅ 로컬 개발용 포트 설정 (Vercel은 이 부분 무시함)
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

// ✅ Vercel 배포용 export
module.exports = app;
