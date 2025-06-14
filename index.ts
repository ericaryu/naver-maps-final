const express = require("express");
const axios = require("axios");
const app = express();

// 🔄 주소 또는 건물명 → 좌표 변환 (keyword 기반)
async function getCoordinatesFromAddress(query) {
  const url = "https://dapi.kakao.com/v2/local/search/keyword.json";
  const headers = {
    Authorization: `KakaoAK ${process.env.KAKAO_API_KEY}`,
  };

  const response = await axios.get(url, {
    params: { query },
    headers,
  });

  const { documents } = response.data;
  if (documents.length === 0) throw new Error("주소 또는 장소명을 찾을 수 없습니다.");

  const { x, y } = documents[0];
  return { x, y };
}

// 🔄 길찾기 (거리/시간)
async function getDirection(origin, destination) {
  const url = "https://apis-navi.kakaomobility.com/v1/directions";
  const headers = {
    Authorization: `KakaoAK ${process.env.KAKAO_API_KEY}`,
  };

  const response = await axios.get(url, {
    params: {
      origin: `${origin.x},${origin.y}`,
      destination: `${destination.x},${destination.y}`,
    },
    headers,
  });

  const { distance, duration } = response.data.routes[0].summary;
  return { distance, duration };
}

// 🗺️ 지도 이미지 URL 생성
function getMapImageUrl(start, goal) {
  const url = "https://dapi.kakao.com/v2/maps/staticmap";
  const params = new URLSearchParams({
    width: "600",
    height: "400",
    markers: `color:red|label:S|${start.x},${start.y}|color:blue|label:G|${goal.x},${goal.y}`,
  });
  return `${url}?${params.toString()}`;
}

// 📍 /route-info?from=주소1&to=주소2
app.get("/route-info", async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: "from and to query parameters are required" });
  }

  try {
    const origin = await getCoordinatesFromAddress(from);
    const destination = await getCoordinatesFromAddress(to);

    const { distance, duration } = await getDirection(origin, destination);
    const imageUrl = getMapImageUrl(origin, destination);

    res.json({
      origin: from,
      destination: to,
      distance,
      duration,
      imageUrl,
    });
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      error: error.message,
      details: error.response?.data || null,
    });
  }
});

module.exports = app;
