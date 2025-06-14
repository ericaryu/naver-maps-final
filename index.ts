import express from "express";
import axios from "axios";

const app = express();

// 환경변수 확인
const { KAKAO_API_KEY, ODCLOUD_API_KEY } = process.env;
if (!KAKAO_API_KEY) throw new Error("Missing KAKAO_API_KEY");
if (!ODCLOUD_API_KEY) throw new Error("Missing ODCLOUD_API_KEY");

// 1) 주소 → 좌표 변환
async function getCoordinates(address: string): Promise<{ x: number; y: number }> {
  const url = "https://dapi.kakao.com/v2/local/search/keyword.json";
  const headers = { Authorization: `KakaoAK ${KAKAO_API_KEY}` };
  const response = await axios.get(url, { params: { query: address, size: 1 }, headers });
  const docs = response.data.documents;
  if (!docs || docs.length === 0) throw new Error("주소를 찾을 수 없습니다.");
  return { x: parseFloat(docs[0].x), y: parseFloat(docs[0].y) };
}

// 2) 카카오맵 화장실 검색
interface Place {
  source: 'kakao' | 'public';
  type?: string;
  name: string;
  address: string;
  x: number;
  y: number;
  distance: number;
  nursingRoom: boolean;
  groundLevel: boolean;
  isFree: boolean;
  openingHours: string;
}

async function searchKakaoRestrooms(x: number, y: number): Promise<Place[]> {
  const url = "https://dapi.kakao.com/v2/local/search/keyword.json";
  const headers = { Authorization: `KakaoAK ${KAKAO_API_KEY}` };
  const { data } = await axios.get(url, {
    params: { query: "화장실", x, y, radius: 1000, size: 15, sort: "distance" },
    headers,
  });

  const userLoc = { x, y };
  const places: Place[] = data.documents.map((doc: any) => {
    const px = parseFloat(doc.x);
    const py = parseFloat(doc.y);
    // 임시 필터링 필드 (실제 로직은 별도 API/데이터 필요)
    const nursingRoom = doc.place_name.includes("수유실");
    const groundLevel = !doc.address_name.includes("지하");
    const isFree = true;
    const openingHours = "Unknown";

    return {
      source: 'kakao',
      name: doc.place_name,
      address: doc.road_address_name || doc.address_name,
      x: px,
      y: py,
      distance: Math.round(
        Math.sqrt(
          (px - userLoc.x) ** 2 + (py - userLoc.y) ** 2
        ) * 111000 // 대략 변환
      ),
      nursingRoom,
      groundLevel,
      isFree,
      openingHours,
    };
  });
  return places;
}

// 3) 공공데이터: 역사공중화장실 가져오기
async function fetchPublicRestrooms(): Promise<Place[]> {
  const url = "https://api.odcloud.kr/api/15044453/v1/uddi:3f0b1632-3ac0-4bc2-97ef-8fa94fcfb23c";
  const { data } = await axios.get(url, {
    params: { page: 1, perPage: 1000, serviceKey: ODCLOUD_API_KEY },
  });
  const items = data.data || [];
  return items.map((item: any) => ({
    source: 'public',
    name: item.역사명
      ? `${item.역사명} 역사공중화장실`
      : `${item.소재지도로명주소 || item.소재지지번주소 || '화장실'} 공중화장실`,
    address: item.소재지도로명주소 || item.소재지지번주소,
    x: parseFloat(item.경도),
    y: parseFloat(item.위도),
    distance: 0,
    nursingRoom: false,
    groundLevel: false,
    isFree: true,
    openingHours: item.운영시간 || 'Unknown',
  }));
}

// 4) 거리 계산 (Haversine)
function calcDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.y - a.y);
  const dLon = toRad(b.x - a.x);
  const ay = toRad(a.y);
  const by = toRad(b.y);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(ay) * Math.cos(by) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 5) 필터 적용 및 상위2 추출
app.get("/recommend-restrooms", async (req, res) => {
  const address = (req.query.address || '').toString();
  if (!address) return res.status(400).json({ error: 'address required' });

  // 필터 파라미터
  const nursingRoom = req.query.nursingRoom === 'true';
  const groundLevel = req.query.groundLevel === 'true';
  const isFree = req.query.isFree === 'true';

  try {
    const userLoc = await getCoordinates(address);
    const kakao = (await searchKakaoRestrooms(userLoc.x, userLoc.y))
      .filter(p =>
        (req.query.nursingRoom == null || p.nursingRoom === nursingRoom) &&
        (req.query.groundLevel == null || p.groundLevel === groundLevel) &&
        (req.query.isFree == null || p.isFree === isFree)
      )
      .slice(0, 5);

    const pubRaw = await fetchPublicRestrooms();
    const pub = pubRaw.map(p => ({ ...p, distance: Math.round(calcDistance(userLoc, p)) }))
      .filter(p =>
        (req.query.nursingRoom == null || p.nursingRoom === nursingRoom) &&
        (req.query.groundLevel == null || p.groundLevel === groundLevel) &&
        (req.query.isFree == null || p.isFree === isFree)
      )
      .slice(0, 5);

    const combined = [...kakao, ...pub]
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 2)
      .map((p, i) => ({
        type: i === 0 ? 'closest' : 'second_closest',
        ...p
      }));

    res.json({ currentLocation: address, recommendations: combined });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default app;
