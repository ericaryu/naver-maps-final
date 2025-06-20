// server.js
const express = require("express");
const axios = require("axios");
const app = express();

// 필수 환경변수 체크
const { KAKAO_API_KEY, ODCLOUD_API_KEY } = process.env;
if (!KAKAO_API_KEY) throw new Error("Missing KAKAO_API_KEY");
if (!ODCLOUD_API_KEY) throw new Error("Missing ODCLOUD_API_KEY");

// 1) 주소 → 좌표 변환 (키워드 검색 기반)
async function getCoordinatesFromAddress(address) {
  const url = "https://dapi.kakao.com/v2/local/search/keyword.json";
  const headers = { Authorization: `KakaoAK ${KAKAO_API_KEY}` };

  const response = await axios.get(url, {
    params: { query: address, size: 1 },
    headers,
  });

  const docs = response.data.documents;
  if (!docs.length) throw new Error("주소를 찾을 수 없습니다.");
  return { x: parseFloat(docs[0].x), y: parseFloat(docs[0].y) };
}

// 2) 카카오맵으로 주변 '화장실' 검색 (반경 1km, 상위 5개, 거리순)
async function searchKakaoRestrooms(x, y) {
  const url = "https://dapi.kakao.com/v2/local/search/keyword.json";
  const headers = { Authorization: `KakaoAK ${KAKAO_API_KEY}` };

  const { data } = await axios.get(url, {
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

  return data.documents.map(doc => ({
    source: "kakao",
    name: doc.place_name,
    address: doc.road_address_name || doc.address_name,
    x: parseFloat(doc.x),
    y: parseFloat(doc.y),
    distance: doc.distance != null ? parseInt(doc.distance, 10) : null,
    mapImageUrl: getMapImageUrl({ x, y }, { x: doc.x, y: doc.y }),
  }));
}

// 3) 공공데이터: 역사공중화장실 정보 (최대 1000건)
async function fetchPublicRestrooms() {
  const url = "https://api.odcloud.kr/api/15044453/v1/uddi:3f0b1632-3ac0-4bc2-97ef-8fa94fcfb23c";
  const { data } = await axios.get(url, {
    params: {
      page: 1,
      perPage: 1000,
      serviceKey: ODCLOUD_API_KEY,
    },
  });
  return (data.data || []).map(item => ({
    source: "public",
    name: item.역사명 ? `${item.역사명} 역사공중화장실` : `${item.소재지도로명주소 || item.소재지지번주소} 공중화장실`,
    address: item.소재지도로명주소 || item.소재지지번주소,
    x: parseFloat(item.경도),
    y: parseFloat(item.위도),
    distance: null,       // 나중에 계산
    mapImageUrl: null,    // 나중에 계산
  }));
}

// 4) Haversine 공식으로 거리(m) 계산
function calcDistance(user, place) {
  const toRad = deg => (deg * Math.PI) / 180;
  const R = 6371000; // 지구 반경(m)
  const dLat = toRad(place.y - user.y);
  const dLon = toRad(place.x - user.x);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(user.y)) *
    Math.cos(toRad(place.y)) *
    Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// 5) 정적 지도 URL 생성 (카카오맵 Static API)
function getMapImageUrl(start, goal) {
  const url = "https://dapi.kakao.com/v2/maps/staticmap";
  const params = new URLSearchParams({
    width: "600",
    height: "400",
    markers: [
      `color:red|label:S|${start.x},${start.y}`,
      `color:blue|label:G|${goal.x},${goal.y}`,
    ].join("|"),
  });
  return `${url}?${params.toString()}`;
}

// 6) 카카오 + 공공데이터 합치고, 거리/지도URL 계산 후 상위 2개
async function getTopTwoRestrooms(user) {
  const kakaoList = await searchKakaoRestrooms(user.x, user.y);
  const publicList = await fetchPublicRestrooms();

  const pubWithDist = publicList.map(place => {
    const dist = Math.round(calcDistance(user, place));
    return {
      ...place,
      distance: dist,
      mapImageUrl: getMapImageUrl({ x: user.x, y: user.y }, { x: place.x, y: place.y }),
    };
  });

  const all = [...kakaoList, ...pubWithDist];

  return all
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 2);
}

// 7) 메인 엔드포인트
app.get("/recommend-restrooms", async (req, res) => {
  const address = (req.query.address || "").toString().trim();
  if (!address) {
    return res.status(400).json({ error: "address query parameter is required" });
  }

  try {
    const userLoc = await getCoordinatesFromAddress(address);
    const topTwo = await getTopTwoRestrooms(userLoc);

    const recommendations = topTwo.map((r, i) => ({
      type: i === 0 ? "가장 가까운 화장실" : "두 번째로 가까운 화장실",
      source: r.source,
      name: r.name,
      address: r.address,
      x: r.x,
      y: r.y,
      distance: r.distance,
      mapImageUrl: r.mapImageUrl,
    }));

    return res.json({
      currentLocation: address,
      recommendations,
    });
  } catch (err) {
    console.error(err);
    const message = err.message.includes("없습니다") ? err.message : "알 수 없는 오류";
    const code = err.message.includes("없습니다") ? 404 : 500;
    return res.status(code).json({ error: message });
  }
});

module.exports = app;
