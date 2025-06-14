const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());

const KAKAO_API_KEY = process.env.KAKAO_API_KEY;

// 주소 → 좌표 변환
async function geocode(address) {
  const url = "https://dapi.kakao.com/v2/local/search/address.json";
  const headers = { Authorization: `KakaoAK ${KAKAO_API_KEY}` };
  const res = await axios.get(url, { params: { query: address }, headers });

  const doc = res.data.documents[0];
  if (!doc) throw new Error("주소를 찾을 수 없습니다.");
  return { x: doc.x, y: doc.y };
}

// 좌표 기준 화장실 검색 (category_group_code: 'PM9' → 공중화장실)
async function searchNearbyRestrooms(x, y) {
  const url = "https://dapi.kakao.com/v2/local/search/category.json";
  const headers = { Authorization: `KakaoAK ${KAKAO_API_KEY}` };

  const res = await axios.get(url, {
    params: {
      category_group_code: "PM9",
      x,
      y,
      radius: 3000, // 3km 이내
      sort: "distance",
    },
    headers,
  });

  return res.data.documents;
}

// 거리, 시간 계산
async function getRoute(startX, startY, endX, endY) {
  const url = "https://apis-navi.kakaomobility.com/v1/directions";
  const headers = { Authorization: `KakaoAK ${KAKAO_API_KEY}` };

  const res = await axios.get(url, {
    params: {
      origin: `${startX},${startY}`,
      destination: `${endX},${endY}`,
    },
    headers,
  });

  const summary = res.data.routes?.[0]?.summary;
  if (!summary) throw new Error("경로 정보를 찾을 수 없습니다.");

  return {
    distance: summary.distance,
    duration: summary.duration,
  };
}

// 정적 지도 이미지 URL
function generateMapUrl(startX, startY, endX, endY) {
  const baseUrl = "https://dapi.kakao.com/v2/maps/staticmap";
  const params = new URLSearchParams({
    width: "600",
    height: "400",
    markers: `color:blue|label:S|${startX},${startY}|color:red|label:D|${endX},${endY}`,
  });
  return `${baseUrl}?${params.toString()}`;
}

// 추천 화장실 API
app.get("/recommend-restrooms", async (req, res) => {
  const { address } = req.query;
  if (!address) return res.status(400).json({ error: "주소가 필요합니다." });

  try {
    const userCoord = await geocode(address);
    const restrooms = await searchNearbyRestrooms(userCoord.x, userCoord.y);

    if (restrooms.length === 0) {
      return res.status(404).json({ error: "주변에 화장실이 없습니다." });
    }

    const restroomWithRoute = await Promise.all(
      restrooms.map(async (r) => {
        const route = await getRoute(userCoord.x, userCoord.y, r.x, r.y);
        return {
          name: r.place_name,
          address: r.road_address_name || r.address_name,
          x: r.x,
          y: r.y,
          distance: route.distance,
          duration: route.duration,
          mapImageUrl: generateMapUrl(userCoord.x, userCoord.y, r.x, r.y),
        };
      })
    );

    const byDistance = [...restroomWithRoute].sort((a, b) => a.distance - b.distance)[0];
    const byDuration = [...restroomWithRoute].sort((a, b) => a.duration - b.duration)[0];

    res.json({
      currentLocation: address,
      recommendations: [
        {
          type: "가장 가까운 화장실",
          ...byDistance,
        },
        {
          type: "가장 빨리 도착하는 화장실",
          ...byDuration,
        },
      ],
    });
  } catch (error) {
    console.error("추천 실패:", error.message);
    res.status(500).json({ error: "추천 실패", details: error.message });
  }
});

module.exports = app;
