const express = require("express");
const axios = require("axios");
const app = express();

// 주소 → 좌표
async function getCoordinatesFromAddress(address) {
  const url = "https://dapi.kakao.com/v2/local/search/address.json";
  const headers = {
    Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}`,
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

// 키워드 기반 장소 검색 (화장실)
async function searchNearbyRestrooms(x, y) {
  const url = "https://dapi.kakao.com/v2/local/search/keyword.json";
  const headers = {
    Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}`,
  };

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

  return response.data.documents.map(doc => ({
    name: doc.place_name,
    address: doc.road_address_name || doc.address_name,
    x: doc.x,
    y: doc.y,
    distance: doc.distance ? parseInt(doc.distance, 10) : null,
    mapImageUrl: getMapImageUrl({ x, y }, { x: doc.x, y: doc.y }),
  }));
}

// 정적 지도 이미지 생성
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
    const restrooms = await searchNearbyRestrooms(userLoc.x, userLoc.y);

    if (restrooms.length === 0) {
      return res.status(404).json({ error: "주변 1km 이내에 화장실이 없습니다." });
    }

    // 거리 기준 상위 2개
    const topTwo = restrooms.slice(0, 2);

    res.json({
      currentLocation: address,
      recommendations: topTwo.map((r, i) => ({
        type: i === 0 ? "가장 가까운 화장실" : "두 번째로 가까운 화장실",
        ...r,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
