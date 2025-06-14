const express = require("express");
const axios = require("axios");
const app = express();

// 주소 → 좌표 변환
async function getCoordinatesFromAddress(address) {
  const url = "https://dapi.kakao.com/v2/local/search/address.json";
  const headers = { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` };
  const response = await axios.get(url, {
    params: { query: address },
    headers,
  });

  const { documents } = response.data;
  if (documents.length === 0) throw new Error("주소를 찾을 수 없습니다.");
  const { x, y } = documents[0];
  return { x, y };
}

// 키워드 기반 주변 장소 검색 (화장실)
async function searchNearbyRestrooms(x, y) {
  const url = "https://dapi.kakao.com/v2/local/search/keyword.json";
  const headers = { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` };
  const response = await axios.get(url, {
    params: {
      query: "화장실",
      x,
      y,
      radius: 1000,
      size: 5, // 상위 5개만
      sort: "distance"
    },
    headers,
  });

  return response.data.documents.map(doc => ({
    name: doc.place_name,
    address: doc.road_address_name || doc.address_name,
    x: doc.x,
    y: doc.y,
  }));
}

// 길찾기 (카카오 내비)
async function getDirection(origin, destination) {
  const url = "https://apis-navi.kakaomobility.com/v1/directions";
  const headers = { Authorization: `KakaoAK ${process.env.KAKAO_NAVIGATION_API_KEY}` };
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

// 정적 지도 이미지
function getMapImageUrl(start, goal) {
  const url = "https://dapi.kakao.com/v2/maps/staticmap";
  const params = new URLSearchParams({
    width: "600",
    height: "400",
    markers: `color:red|label:S|${start.x},${start.y}|color:blue|label:G|${goal.x},${goal.y}`,
  });
  return `${url}?${params.toString()}`;
}

// 메인 API
app.get("/recommend-restrooms", async (req, res) => {
  const { address } = req.query;
  if (!address) {
    return res.status(400).json({ error: "address query parameter is required" });
  }

  try {
    const userLoc = await getCoordinatesFromAddress(address);
    const candidates = await searchNearbyRestrooms(userLoc.x, userLoc.y);

    if (candidates.length === 0) {
      return res.status(404).json({ error: "근처에 검색된 화장실이 없습니다." });
    }

    const enriched = await Promise.all(
      candidates.map(async (place) => {
        const { distance, duration } = await getDirection(userLoc, { x: place.x, y: place.y });
        return {
          ...place,
          distance,
          duration,
          mapImageUrl: getMapImageUrl(userLoc, place),
        };
      })
    );

    // 거리순/시간순 추천
    const closest = [...enriched].sort((a, b) => a.distance - b.distance)[0];
    const fastest = [...enriched].sort((a, b) => a.duration - b.duration)[0];

    res.json({
      currentLocation: address,
      recommendations: [
        { type: "가장 가까운 화장실", ...closest },
        { type: "가장 빨리 도착하는 화장실", ...fastest },
      ],
    });

  } catch (error) {
    console.error("🔥 오류:", error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = app;
