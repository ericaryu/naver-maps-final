import express from "express";
import axios from "axios";

const app = express();

// 1) 주소 → 좌표 변환 (키워드 검색)
async function getCoordinatesFromAddress(address: string) {
  const url = "https://dapi.kakao.com/v2/local/search/keyword.json";
  const headers = {
    Authorization: `KakaoAK ${process.env.KAKAO_API_KEY}`,
  };

  const response = await axios.get(url, {
    params: { query: address, size: 1 },
    headers,
  });

  const docs = response.data.documents;
  if (!docs.length) throw new Error("주소를 찾을 수 없습니다.");

  return { x: docs[0].x, y: docs[0].y };
}

// 2) 키워드 기반 주변 화장실 검색 (반경 1km, 상위 5개, 거리순)
async function searchNearbyRestrooms(x: string, y: string) {
  const url = "https://dapi.kakao.com/v2/local/search/keyword.json";
  const headers = {
    Authorization: `KakaoAK ${process.env.KAKAO_API_KEY}`,
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

  const docs = response.data.documents;
  if (!docs.length) throw new Error("주변에 화장실이 없습니다.");

  return docs.map((doc: any) => ({
    name: doc.place_name,
    address: doc.road_address_name || doc.address_name,
    x: doc.x,
    y: doc.y,
    distance: doc.distance != null ? parseInt(doc.distance, 10) : null,
  }));
}

// 3) 정적 지도 URL 생성 (필요시)
function getMapImageUrl(
  start: { x: string; y: string },
  goal: { x: string; y: string }
) {
  const url = "https://dapi.kakao.com/v2/maps/staticmap";
  const params = new URLSearchParams({
    width: "600",
    height: "400",
    markers: `color:red|label:S|${start.x},${start.y}|color:blue|label:G|${goal.x},${goal.y}`,
  });
  return `${url}?${params.toString()}`;
}

// 4) 보행 시간 계산 (m 단위 거리 → 분 단위 예상 시간)
function calcWalkingMinutes(distance: number | null) {
  if (distance == null) return "?분";
  // 평균 도보 속도 80m/분
  return `도보 ${Math.max(1, Math.round(distance / 80))}분`;
}

// 5) 메인 엔드포인트 (텍스트 응답)
app.get("/recommend-restrooms", async (req, res) => {
  const address = String(req.query.address || "").trim();
  if (!address) {
    return res
      .status(400)
      .type("text/plain")
      .send("❌ address query parameter is required");
  }

  try {
    // 1) 사용자 좌표
    const userLoc = await getCoordinatesFromAddress(address);

    // 2) 주변 화장실 검색
    const places = await searchNearbyRestrooms(userLoc.x, userLoc.y);

    // 3) 거리 기준 상위 2개
    const topTwo = places.slice(0, 2);

    // 4) 텍스트 포맷 빌드
    const textOutput = topTwo
      .map((place, idx) => {
        const title = `추천 화장실 ${idx + 1}. ${place.name}`;
        const lines = [
          title,
          `주소 : ${place.address}`,
          `거리 : 약 ${place.distance}
