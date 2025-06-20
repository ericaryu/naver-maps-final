import axios from "axios";
import { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { KAKAO_API_KEY, ODCLOUD_API_KEY } = process.env;
  if (!KAKAO_API_KEY || !ODCLOUD_API_KEY) {
    return res.status(500).json({ error: "Missing Kakao or ODCLOUD API key" });
  }

  const address = String(req.query.address || "");
  if (!address) {
    return res.status(400).json({ error: "address query required" });
  }
  
  interface Place {
    source: "kakao" | "public";
    type: "closest" | "second_closest";
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
    score?: number;
  }

  const computeScore = (p: Place, weights: Record<string, boolean>) => {
    let score = 0;
    score += 100 - Math.min(p.distance / 10, 100);
    if (weights.nursingRoom && p.nursingRoom) score += 50;
    if (weights.groundLevel && p.groundLevel) score += 30;
    if (weights.isFree && p.isFree) score += 10;
    return score;
  };

  const getWeights = (q: string) => ({
    nursingRoom: /기저귀|수유|아기|아이/.test(q),
    groundLevel: /지상|휠체어|유모차/.test(q),
    isFree: /무료|공짜/.test(q),
  });

  const isSimple = (q: string) => !(/기저귀|수유|아기|아이|유모차|휠체어/.test(q));

  // Geocode via Kakao
  const geo = async (addr: string) => {
    try {
      const { data } = await axios.get("https://dapi.kakao.com/v2/local/search/keyword.json", {
        headers: { Authorization: `KakaoAK ${KAKAO_API_KEY}` },
        params: { query: addr, size: 1 }
      });
      const doc = data.documents[0];
      return { x: parseFloat(doc.x), y: parseFloat(doc.y) };
    } catch (e) {
      console.error(e);
      throw new Error("Geocoding failed");
    }
  };

  // Fetch Kakao restrooms
  const searchKakao = async (x: number, y: number) => {
    try {
      const { data } = await axios.get("https://dapi.kakao.com/v2/local/search/keyword.json", {
        headers: { Authorization: `KakaoAK ${KAKAO_API_KEY}` },
        params: { query: "화장실", x, y, radius: 1000, size: 5, sort: "distance" }
      });
      return data.documents.map((doc: any): Place => ({
        source: "kakao",
        type: "closest",
        name: doc.place_name,
        address: doc.road_address_name || doc.address_name,
        x: parseFloat(doc.x),
        y: parseFloat(doc.y),
        distance: parseInt(doc.distance, 10),
        nursingRoom: doc.place_name.includes("수유실"),
        groundLevel: !doc.address_name.includes("지하"),
        isFree: true,
        openingHours: "Unknown",
      }));
    } catch (e) {
      console.error(e);
      return [];
    }
  };

  // Fetch public restrooms
  const fetchPublic = async () => {
    try {
      const { data } = await axios.get("https://api.odcloud.kr/api/15044453/v1/uddi:3f0b1632-3ac0-4bc2-97ef-8fa94fcfb23c", {
        params: { page: 1, perPage: 1000, serviceKey: ODCLOUD_API_KEY }
      });
      return data.data.map((item: any): Place => ({
        source: "public",
        type: "closest",
        name: item.역사명 ? `${item.역사명} 역사공중화장실` : `${item.소재지도로명주소 || item.소재지지번주소} 공중화장실`,
        address: item.소재지도로명주소 || item.소재지지번주소,
        x: parseFloat(item.경도),
        y: parseFloat(item.위도),
        distance: NaN,
        nursingRoom: [
          item['기저귀교환대설치유무-남자화장실'],
          item['기저귀교환대설치유무-여자화장실']
        ].includes('Y'),
        groundLevel: item['지상 또는 지하 구분'] === '지상',
        isFree: true,
        openingHours: item.개방시간,
        gateInside: item['게이트 내외 구분'],
        exitNumber: item['(근접) 출입구 번호'],
        detailedLocation: item['상세위치'],
      }));
    } catch (e) {
      console.error(e);
      return [];
    }
  };

  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const toRad = (d: number) => d * Math.PI / 180;
    const R = 6371000;
    const dLat = toRad(b.y - a.y);
    const dLon = toRad(b.x - a.x);
    const ay = toRad(a.y);
    const by = toRad(b.y);
    const h = Math.sin(dLat/2)**2 + Math.cos(ay)*Math.cos(by)*Math.sin(dLon/2)**2;
    return 2*R*Math.asin(Math.sqrt(h));
  };

  try {
    const userLoc = await geo(address);
    const kakaoList = await searchKakao(userLoc.x, userLoc.y);
    const publicList = (await fetchPublic())
      .map(p => ({ ...p, distance: dist(userLoc, p) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);

    const qText = `${address} ${req.query.q || ''}`;
    const simple = isSimple(qText);
    const weights = getWeights(qText);

    const combined = [...kakaoList, ...publicList]
      .map(p => ({
        ...p,
        distance: dist(userLoc, p),
        score: simple ? 0 : computeScore(p, weights)
      }))
      .sort((a, b) => simple ? a.distance - b.distance : (b.score! - a.score!))
      .slice(0, 2)
      .map((p, i) => ({ ...p, type: i === 0 ? 'closest' : 'second_closest'}));

    const output = combined.map(p => ({
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
      score: simple ? undefined : p.score,
    }));

    res.json({ currentLocation: address, recommendations: output });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: 'Server error', detail: e.message });
  }
}