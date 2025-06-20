// api/recommend-restrooms.ts
import axios from "axios";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// 점수 계산 함수
function computeScore(
  p: { distance: number; nursingRoom: boolean; groundLevel: boolean; isFree: boolean },
  weights: { nursingRoom: boolean; groundLevel: boolean; isFree: boolean }
): number {
  let score = 0;
  score += 100 - Math.min(p.distance / 10, 100);
  if (weights.nursingRoom && p.nursingRoom) score += 50;
  if (weights.groundLevel && p.groundLevel) score += 30;
  if (weights.isFree && p.isFree) score += 10;
  return score;
}

// 쿼리 문자열로부터 가중치 추출
function getWeights(q: string) {
  return {
    nursingRoom: /기저귀|수유|아기|아이/.test(q),
    groundLevel: /지상|휠체어|유모차/.test(q),
    isFree: /무료|공짜/.test(q),
  };
}

// 단순 거리 정렬 모드 여부
function isSimple(q: string) {
  return !(/기저귀|수유|아기|아이|유모차|휠체어/.test(q));
}

// 위경도로부터 두 지점 거리 계산 (미터)
function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.y - a.y);
  const dLon = toRad(b.x - a.x);
  const ay = toRad(a.y);
  const by = toRad(b.y);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(ay) * Math.cos(by) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Vercel API 핸들러
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { KAKAO_API_KEY, ODCLOUD_API_KEY } = process.env;
  if (!KAKAO_API_KEY || !ODCLOUD_API_KEY) {
    return res.status(500).json({ error: "Missing Kakao or ODCLOUD API key" });
  }

  const address = String(req.query.address || "");
  if (!address) {
    return res.status(400).json({ error: "address query required" });
  }

  try {
    // 1) 지오코딩
    const geoResp = await axios.get(
      "https://dapi.kakao.com/v2/local/search/keyword.json",
      {
        headers: { Authorization: `KakaoAK ${KAKAO_API_KEY}` },
        params: { query: address, size: 1 },
      }
    );
    const doc = geoResp.data.documents[0];
    if (!doc) throw new Error("Geocoding failed");
    const userLoc = { x: parseFloat(doc.x), y: parseFloat(doc.y) };

    // 2) 카카오 화장실 검색
    const kakaoResp = await axios.get(
      "https://dapi.kakao.com/v2/local/search/keyword.json",
      {
        headers: { Authorization: `KakaoAK ${KAKAO_API_KEY}` },
        params: { query: "화장실", x: userLoc.x, y: userLoc.y, radius: 1000, size: 5, sort: "distance" },
      }
    );
    const kakaoList = kakaoResp.data.documents.map((d: any) => ({
      source: "kakao" as const,
      type: "closest" as const,
      name: d.place_name,
      address: d.road_address_name || d.address_name,
      x: parseFloat(d.x),
      y: parseFloat(d.y),
      distance: parseInt(d.distance, 10),
      nursingRoom: d.place_name.includes("수유실"),
      groundLevel: !d.address_name.includes("지하"),
      isFree: true,
      openingHours: "Unknown",
    }));

    // 3) 공공 화장실 검색
    const publicResp = await axios.get(
      "https://api.odcloud.kr/api/15044453/v1/uddi:3f0b1632-3ac0-4bc2-97ef-8fa94fcfb23c",
      { params: { page: 1, perPage: 1000, serviceKey: ODCLOUD_API_KEY } }
    );
    const publicList = publicResp.data.data
      .map((item: any) => ({
        source: "public" as const,
        type: "closest" as const,
        name: item.역사명
          ? `${item.역사명} 역사공중화장실`
          : `${item.소재지도로명주소 || item.소재지지번주소} 공중화장실`,
        address: item.소재지도로명주소 || item.소재지지번주소,
        x: parseFloat(item.경도),
        y: parseFloat(item.위도),
        nursingRoom:
          item["기저귀교환대설치유무-남자화장실"] === "Y" ||
          item["기저귀교환대설치유무-여자화장실"] === "Y",
        groundLevel: item["지상 또는 지하 구분"] === "지상",
        isFree: true,
        openingHours: item.개방시간,
        gateInside: item["게이트 내외 구분"],
        exitNumber: item["(근접) 출입구 번호"],
        detailedLocation: item.상세위치,
      }))
      .map((p: any) => ({ ...p, distance: dist(userLoc, p) }))
      .sort((a: any, b: any) => a.distance - b.distance)
      .slice(0, 3);

    // 4) 랭킹 및 정렬
    const fullQuery = `${address} ${String(req.query.q || "")}`;
    const simpleFlag = isSimple(fullQuery);
    const weights = getWeights(fullQuery);
    const combined = [...kakaoList, ...publicList]
      .map((p) => ({ ...p, score: simpleFlag ? 0 : computeScore(p, weights) }))
      .sort((a, b) => (simpleFlag ? a.distance - b.distance : b.score - a.score))
      .slice(0, 2)
      .map((p, i) => ({ ...p, type: i === 0 ? "closest" : "second_closest" }));

    const output = combined.map((p) => ({
      source: p.source,
      type: p.type,
      name: p.name,
      address: p.address,
      x: p.x,
      y: p.y,
      distance: p.distance,
      nursingRoom: p.nursingRoom,
      groundLevel: p.groundLevel,
      isFree: p.isFree,
      openingHours: p.openingHours,
      score: simpleFlag ? undefined : p.score,
    }));

    return res.status(200).json({ currentLocation: address, recommendations: output });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: "Server error", detail: err.message });
  }
}
