const express = require("express");
const axios = require("axios");
const app = express();

// 주소 → 좌표 변환
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
  if (!documents.length) throw new Error("주소를 찾을 수 없습니다.");
  const { x, y } = documents[0];
  return { x, y };
}

// 경로 거리/시간 계산
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
    markers: `color:red|label:S|${start.x},${start.y}|color:blue|label:G|${goal.x},${goal.y}`,
  });
  return `${url}?${params.toString()}`;
}

// 테스트용 화장실 후보 (임시)
const restrooms = [
  {
    name: "서울시청 공중화장실",
    address: "서울특별시 중구 세종대로 110",
    x: "126.9779692",
    y: "37.566535",
  },
  {
    name: "광화문역 5번 출구 공중화장실",
    address: "서울특별시 종로구 세종대로 175",
    x: "126.9769",
    y: "37.5714",
  },
  {
    name: "을지로입구역 1번 출구 공중화장실",
    address: "서울특별시 중구 남대문로 119",
    x: "126.982715",
    y: "37.566324",
  },
];

// 추천 API
app.get("/recommend-restrooms", async (req, res) => {
  const { address } = req.query;
  if (!address) return res.status(400).json({ error: "address is required" });

  try {
    const userLoc = await getCoordinatesFromAddress(address);

    const results = await Promise.all(
      restrooms.map(async (r) => {
        const direction = await getDirection(userLoc, { x: r.x, y: r.y });
        return {
          name: r.name,
          address: r.address,
          distance: direction.distance,
          duration: direction.duration,
          mapImageUrl: getMapImageUrl(userLoc, { x: r.x, y: r.y }),
        };
      })
    );

    const byDistance = [...results].sort((a, b) => a.distance - b.distance)[0];
    const byDuration = [...results].sort((a, b) => a.duration - b.duration)[0];

    res.json({
      currentLocation: address,
      recommendations: [
        { type: "가장 가까운 화장실", ...byDistance },
        { type: "가장 빨리 도착하는 화장실", ...byDuration },
      ],
    });
  } catch (err) {
    console.error("Error in /recommend-restrooms:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
