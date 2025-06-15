import express from "express";
import axios from "axios";

const app = express();

// 환경변수 확인
const { KAKAO_API_KEY, ODCLOUD_API_KEY } = process.env;
if (!KAKAO_API_KEY) throw new Error("Missing KAKAO_API_KEY");
if (!ODCLOUD_API_KEY) throw new Error("Missing ODCLOUD_API_KEY");

// Raw 공공데이터 컬럼 전체 관리
type RawPublicRestroom = Record<string, any>;

// 응답 Place 타입 정의
interface Place {
  source: 'kakao' | 'public';
  type: 'closest' | 'second_closest';
  name: string;
  address: string;
  x: number;
  y: number;
  distance: number;
  nursingRoom: boolean;
  groundLevel: boolean;
  isFree: boolean;
  openingHours: string;
  gateInside?: string;
  exitNumber?: string;
  detailedLocation?: string;
  raw?: RawPublicRestroom;
}

// 1) 주소 -> 좌표 변환
async function getCoordinates(address: string): Promise<{ x: number; y: number }> {
  const url = "https://dapi.kakao.com/v2/local/search/keyword.json";
  const headers = { Authorization: `KakaoAK ${KAKAO_API_KEY}` };
  const response = await axios.get(url, { params: { query: address, size: 1 }, headers });
  const docs = response.data.documents;
  if (!docs || docs.length === 0) throw new Error("주소를 찾을 수 없습니다.");
  return { x: parseFloat(docs[0].x), y: parseFloat(docs[0].y) };
}

// 2) 카카오맵 화장실 검색
async function searchKakaoRestrooms(address: string, filters: any): Promise<Place[]> {
  const { x, y } = await getCoordinates(address);
  const url = "https://dapi.kakao.com/v2/local/search/keyword.json";
  const headers = { Authorization: `KakaoAK ${KAKAO_API_KEY}` };
  const { data } = await axios.get(url, {
    params: { query: "화장실", x, y, radius: 1000, size: 5, sort: "distance" },
    headers,
  });
  return data.documents.map((doc: any) => ({
    source: 'kakao',
    name: doc.place_name,
    address: doc.road_address_name || doc.address_name,
    x: parseFloat(doc.x),
    y: parseFloat(doc.y),
    distance: parseInt(doc.distance, 10),
    nursingRoom: doc.place_name.includes('수유실'),
    groundLevel: !doc.address_name.includes('지하'),
    isFree: true,
    openingHours: 'Unknown',
  })).filter(p =>
    (filters.nursingRoom == null || p.nursingRoom === filters.nursingRoom) &&
    (filters.groundLevel == null || p.groundLevel === filters.groundLevel) &&
    (filters.isFree == null || p.isFree === filters.isFree)
  );
}

// 3) 공공데이터 화장실 불러오기
async function fetchPublicRestrooms(filters: any): Promise<Place[]> {
  const url = "https://api.odcloud.kr/api/15044453/v1/uddi:3f0b1632-3ac0-4bc2-97ef-8fa94fcfb23c";
  const { data } = await axios.get(url, {
    params: { page: 1, perPage: 1000, serviceKey: ODCLOUD_API_KEY },
  });

  return (data.data as RawPublicRestroom[])
    .map(item => ({
      source: 'public',
      name: item.역사명
        ? `${item.역사명} 역사공중화장실`
        : `${item.소재지도로명주소 || item.소재지지번주소} 공중화장실`,
      address: item.소재지도로명주소 || item.소재지지번주소,
      x: parseFloat(item.경도),
      y: parseFloat(item.위도),
      distance: NaN,
      nursingRoom: [
        item['기저귀교환대설치유무-남자화장실'],
        item['기저귀교환대설치유무-남자장애인화장실'],
        item['기저귀교환대설치유무-여자화장실'],
        item['기저귀교환대설치유유무-여자장애인화장실'],
      ].some(v => v === 'Y'),
      groundLevel: item['지상 또는 지하 구분'] === '지상',
      isFree: true,
      openingHours: item.개방시간,
      gateInside: item['게이트 내외 구분'],
      exitNumber: item['(근접) 출입구 번호'],
      detailedLocation: item['상세위치'],
      raw: item,
    }))
    .filter(p =>
      (filters.nursingRoom == null || p.nursingRoom === filters.nursingRoom) &&
      (filters.groundLevel == null || p.groundLevel === filters.groundLevel) &&
      (filters.isFree == null || p.isFree === filters.isFree)
    );
}

// 4) 거리 계산
function calcDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.y - a.y);
  const dLon = toRad(b.x - a.x);
  const ay = toRad(a.y);
  const by = toRad(b.y);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(ay) * Math.cos(by) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// 5) 응답 필터링 함수
function shapePlaceOutput(place: Place, filters: any): Partial<Place> {
  const base: Partial<Place> = {
    source: place.source,
    type: place.type,
    name: place.name,
    address: place.address,
    x: place.x,
    y: place.y,
    distance: place.distance,
  };

  if (filters.nursingRoom != null) base.nursingRoom = place.nursingRoom;
  if (filters.groundLevel != null) base.groundLevel = place.groundLevel;
  if (filters.isFree != null) base.isFree = place.isFree;
  if (filters.showOpeningHours === 'true') base.openingHours = place.openingHours;

  return base;
}

// 6) 메인 엔드포인트
app.get('/recommend-restrooms', async (req, res) => {
  const address = (req.query.address || '').toString();
  if (!address) return res.status(400).json({ error: 'address required' });

  const filters = {
    nursingRoom: req.query.nursingRoom === 'true' ? true : req.query.nursingRoom === 'false' ? false : null,
    groundLevel: req.query.groundLevel === 'true' ? true : req.query.groundLevel === 'false' ? false : null,
    isFree: req.query.isFree === 'true' ? true : req.query.isFree === 'false' ? false : null,
    showOpeningHours: req.query.showOpeningHours === 'true' ? 'true' : null,
  };

  try {
    const userLoc = await getCoordinates(address);
    const kakaoList = await searchKakaoRestrooms(address, filters);
    const publicList = await fetchPublicRestrooms(filters);

    const combined = [...kakaoList, ...publicList]
      .map(p => ({ ...p, distance: calcDistance(userLoc, p) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 2)
      .map((p, i) => ({ ...p, type: i === 0 ? 'closest' : 'second_closest' }));

    const result = combined.map(p => shapePlaceOutput(p, filters));

    res.json({ currentLocation: address, recommendations: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

export default app;

// 7) 역 이름 기반 요약 정보 반환
app.get('/station-restroom-info', async (req, res) => {
  const station = (req.query.station || "").toString().trim();
  if (!station) {
    return res.status(400).json({ error: "station 파라미터가 필요합니다." });
  }

  try {
    const publicList = await fetchPublicRestrooms({}); // 기존에 정의된 함수 그대로 사용
    const matched = publicList.find(p =>
      p.name.includes(station) || (p.raw && p.raw["역사명"] && p.raw["역사명"].includes(station))
    );

    if (!matched) {
      return res.status(404).json({ error: `${station}역 화장실 정보를 찾을 수 없습니다.` });
    }

    res.json({
      station: station,
      restroomName: matched.name,
      exitNumber: matched.exitNumber || "정보 없음",
      gateInside: matched.gateInside || "정보 없음",
      detailedLocation: matched.detailedLocation || "정보 없음",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "서버 오류" });
  }
});