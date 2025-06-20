import express from "express";
import axios from "axios";
const serverless = require("serverless-http");  // 추가

const app = express();

const { KAKAO_API_KEY, ODCLOUD_API_KEY } = process.env;
if (!KAKAO_API_KEY) throw new Error("Missing KAKAO_API_KEY");
if (!ODCLOUD_API_KEY) throw new Error("Missing ODCLOUD_API_KEY");

// --- 여기에 지금 네 전체 /recommend-restrooms 라우트 쭉 유지 ---

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
    const publicListFull = await fetchPublicRestrooms(filters);

    const publicList = publicListFull
      .map(p => ({ ...p, distance: calcDistance(userLoc, p) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);

    const fullQueryText = [address, req.query.q || ''].join(' ');
    const useSimpleRanking = isSimpleQuery(fullQueryText);
    const rankingWeights = getAdaptiveRankingWeights(fullQueryText);

    const combined = [...kakaoList, ...publicList]
      .map(p => {
        const distance = calcDistance(userLoc, p);
        const score = useSimpleRanking ? 0 : computeAdaptiveRankingScore({ ...p, distance }, rankingWeights);
        return { ...p, distance, score };
      })
      .sort((a, b) => (useSimpleRanking ? a.distance - b.distance : b.score - a.score))
      .slice(0, 2)
      .map((p, i): Place => ({ ...p, type: i === 0 ? 'closest' : 'second_closest' }));

    const result = combined.map(p => shapePlaceOutput(p, filters));
    res.json({ currentLocation: address, recommendations: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal error' });
  }
});

// 마지막 줄 반드시 추가!
module.exports.handler = serverless(app);
