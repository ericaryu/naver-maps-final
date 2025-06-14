const express = require("express");
const axios = require("axios");
const app = express();

app.get("/get-directions", async (req, res) => {
  const { start, goal } = req.query;

  const [originX, originY] = start.split(",");
  const [destX, destY] = goal.split(",");

  const url = "https://apis-navi.kakaomobility.com/v1/directions";
  const headers = {
    Authorization: `KakaoAK ${process.env.KAKAO_API_KEY}`, // 여기까지는 기존 Kakao Navi API
  };

  try {
    const response = await axios.get(url, {
      params: {
        origin: `${originX},${originY}`,
        destination: `${destX},${destY}`,
      },
      headers,
    });

    const route = response.data.routes?.[0]; // 첫 번째 경로
    const distance = route?.summary?.distance;
    const duration = route?.summary?.duration;

    // ✅ Kakao 정적 지도 이미지 URL 생성
    const staticMapUrl = `https://map.kakao.com/link/map/도착지,${destY},${destX}`;

    res.status(200).json({
      distance,
      duration,
      imageUrl: staticMapUrl,
    });
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.message,
      details: error.response?.data || null,
    });
  }
});

module.exports = app;
