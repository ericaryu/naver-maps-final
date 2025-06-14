const express = require("express");
const axios = require("axios");
const app = express();

// 주소 → 좌표
async function getCoordinatesFromAddress(address) {
  const url = "https://dapi.kakao.com/v2/local/search/address.json";
  const headers = {
    Authorization: `KakaoAK ${process.env.KAKAO_API_KEY}`,
  };
  const response = await axios.get(url, {
    params: { query: address },
    headers,
  });
  const { documents } = response.data;
  if (documents.length === 0) throw new Error("주소를 찾을 수 없습니다.");
  const { x, y } = documents[0];
  return { x, y };
}

// 길찾기 API 호출
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

// 지도 이미지 URL 생성
function getMapImageUrl(start, goal) {
  const url = "https://dapi.kakao.com/v2/maps/staticmap";
  const params = new URLSearchParams({
    width: "600",
    height: "400",
    markers: `${start.x},${start.y}|${goal.x},${goal.y}`,
  });
  return `${url}?${params.toString()}`;
}

// GET /route-info?from=주소1&to=주소2
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
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = app;
