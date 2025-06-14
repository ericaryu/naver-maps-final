const express = require("express");
const axios = require("axios");
const app = express();

// 1) 주소 → 좌표 변환 (키워드 검색 기반)
async function getCoordinatesFromAddress(address) {
  const url = "https://dapi.kakao.com/v2/local/search/keyword.json";
  const headers = { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` };

  const response = await axios.get(url, {
    params: { query: address, size: 1 },
    headers,
  });

  const docs = response.data.documents;
  if (!docs.length) throw new Error("주소를 찾을 수 없습니다.");

  return { x: docs[0].x, y: docs[0].y };
}

// 2) 키워드 기반 주변 화장실 검색 (반경 1km, 상위 5개)
async function searchNearbyRestrooms(x, y) {
  const url = "https://dapi.kakao.com/v2/local/search/keyword.json";
  const headers = { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` };

  const response = await axios.get(url, {
    params: {
      query: "화장실",
      x,
      y,
      radius: 1000,
      size: 5,
      sort: "distance",
    },
    headers,
  });

  const docs = response.data.documents;
  if (!docs.length) throw new Error("주변에 화장실이 없습니다.");

  return docs.map(doc => ({
    name: doc.place_name,
    address: doc.road_address_name || doc.address_name,
    x: doc.x,
    y: doc.y,
    distance: doc.distance != null ? parseInt(doc.distance, 10) : null,
    mapImageUrl: getMapImageUrl({ x, y }, { x: doc.x, y: doc.y }),
  }));
}

// 3) 정적 지도 URL 생성
function getMapImageUrl(start, goal) {
  const url = "https://dapi.kakao.com/v2/maps/staticmap";
  const params = new URLSearchParams({
    width: "600",
    height: "400",
    markers: `color:red|label:S|${start.x},${start.y}|color:blue|label:G|${goal.x},${goal.y}`,
  });
  return `${url}?${params.toString()}`;
}

// 4) 메인 엔드포인트
app.get("/recommend-restrooms", async (req, res) => {
  const { address } = req.query;
  if (!address) {
    return res.status(400).json({ error: "address query parameter is required" });
  }

  try {
    const userLoc = await getCoordinatesFromAddress(address);
    const restrooms = await searchNearbyRestrooms(userLoc.x, userLoc.y);

    // 거리순 상위 2개
    const recommendations = restrooms.slice(0, 2).map((r, i) => ({
      type: i === 0 ? "가장 가까운 화장실" : "두 번째로 가까운 화장실",
      ...r,
    }));

    res.json({
      currentLocation: address,
      recommendations,
    });
  } catch (err) {
    console.error(err);
    const code = err.message.includes("없습니다") ? 404 : 500;
    res.status(code).json({ error: err.message });
  }
});

module.exports = app;
