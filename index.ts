const express = require("express");
const axios = require("axios");
const app = express();

// 1) 환경 변수 읽기
const { KAKAO_API_KEY, ODCLOUD_API_KEY } = process.env;
if (!KAKAO_API_KEY)  throw new Error("Missing env var: KAKAO_API_KEY");
if (!ODCLOUD_API_KEY) throw new Error("Missing env var: ODCLOUD_API_KEY");

// 2) 주소 → 좌표 변환 (Kakao Local API 키워드 검색)
async function getCoordinates(address) {
  const url = "https://dapi.kakao.com/v2/local/search/keyword.json";
  const { data } = await axios.get(url, {
    params: { query: address, size: 1 },
    headers: { Authorization: `KakaoAK ${KAKAO_API_KEY}` },
  });
  const docs = data.documents;
  if (!docs || docs.length === 0) {
    throw new Error("주소를 찾을 수 없습니다.");
  }
  return { x: parseFloat(docs[0].x), y: parseFloat(docs[0].y) };
}

// 3) 반경 1km 내 '화장실' 검색 (최대 5개, 거리순)
async function searchKakaoRestrooms(x, y) {
  const url = "https://dapi.kakao.com/v2/local/search/keyword.json";
  const { data } = await axios.get(url, {
    params: {
      query: "화장실",
      x, y,
      radius: 1000,
      size: 5,
      sort: "distance"
    },
    headers: { Authorization: `KakaoAK ${KAKAO_API_KEY}` },
  });
  if (!data.documents || data.documents.length === 0) {
    return [];
  }
  return data.documents.map(doc => ({
    source: "kakao",
    name: doc.place_name,
    address: doc.road_address_name || doc.address_name,
    x: parseFloat(doc.x),
    y: parseFloat(doc.y),
    distance: doc.distance != null ? parseInt(doc.distance, 10) : null
  }));
}

// 4) 공공데이터 '역사공중화장실' 목록 조회
async function fetchPublicRestrooms() {
  const url = "https://api.odcloud.kr/api/15044453/v1/uddi:3f0b1632-3ac0-4bc2-97ef-8fa94fcfb23c";
  const { data } = await axios.get(url, {
    params: {
      page: 1,
      perPage: 1000,
      serviceKey: ODCLOUD_API_KEY
    }
  });
  if (!data.data) return [];
  return data.data.map(item => ({
    source: "public",
    name: `${item.역사명} 역사공중화장실`,
    address: item.소재지도로명주소 || item.소재지지번주소,
    x: parseFloat(item.경도),
    y: parseFloat(item.위도),
    distance: null
  }));
}

// 5) Haversine 공식으로 거리 계산 (m)
function calcDistance(u, p) {
  const toRad = d => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(p.y - u.y);
  const dLon = toRad(p.x - u.x);
  const a = Math.sin(dLat/2)**2 +
    Math.cos(toRad(u.y)) * Math.cos(toRad(p.y)) * Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// 6) 후보 병합 후 거리 계산 → 상위 2개
async function getTopTwoRestrooms(user) {
  const kakaoList = await searchKakaoRestrooms(user.x, user.y);
  const publicList = await fetchPublicRestrooms();
  const all = [...kakaoList, ...publicList].map(place => {
    if (place.distance == null) {
      place.distance = Math.round(calcDistance(user, place));
    }
    return place;
  });
  return all.sort((a,b) => a.distance - b.distance).slice(0, 2);
}

// 7) 도보 소요 시간 환산 (80m/분)
function calcWalkingTime(meters) {
  const mins = meters ? Math.max(1, Math.round(meters/80)) : "?";
  return `도보 ${mins}분`;
}

// 8) 메인 엔드포인트
app.get("/recommend-restrooms", async (req, res) => {
  const address = (req.query.address || "").toString().trim();
  if (!address) {
    return res
      .status(400)
      .type("text/plain")
      .send("❌ address query parameter is required");
  }

  try {
    // 사용자 좌표
    const userLoc = await getCoordinates(address);

    // 추천 2곳
    const topTwo = await getTopTwoRestrooms(userLoc);

    // 텍스트 포맷 응답
    const text = topTwo.map((r,i) => {
      const idx = i + 1;
      return [
        `추천 화장실 ${idx}. ${r.name}`,
        `주소 : ${r.address}`,
        `거리 : 약 ${r.distance}m`,
        `소요 시간 : ${calcWalkingTime(r.distance)}`,
      ].join("\n");
    }).join("\n\n");

    res.type("text/plain").send(text);

  } catch (err) {
    console.error(err);
    const msg = err.message || "알 수 없는 오류가 발생했습니다.";
    const code = msg.includes("없습니다") ? 404 : 500;
    res.status(code).type("text/plain").send(`❌ ${msg}`);
  }
});

module.exports = app;
