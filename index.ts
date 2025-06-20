// 📍 getCoordinates 함수 (디버그 추가)
async function getCoordinates(address: string): Promise<{ x: number; y: number }> {
  const url = "https://dapi.kakao.com/v2/local/search/keyword.json";
  const headers = { Authorization: `KakaoAK ${KAKAO_API_KEY}` };

  try {
    const response = await axios.get(url, { params: { query: address, size: 1 }, headers });
    const docs = response.data.documents;

    if (!docs || docs.length === 0) {
      console.error("Kakao API 응답 성공 but 주소 결과 없음", response.data);
      throw new Error("주소를 찾을 수 없습니다.");
    }

    return { x: parseFloat(docs[0].x), y: parseFloat(docs[0].y) };
  } catch (err: any) {
    if (err.response) {
      console.error("Kakao API 호출 실패", {
        status: err.response.status,
        data: err.response.data,
      });
    } else {
      console.error("Kakao API 호출 에러", err.message);
    }

    throw new Error("카카오 API 오류");
  }
}

// 📍 searchKakaoRestrooms 함수 (try-catch 추가)
async function searchKakaoRestrooms(address: string, filters: any): Promise<Place[]> {
  try {
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
  } catch (err: any) {
    console.error("searchKakaoRestrooms 실패", err.message);
    return []; // Kakao API 실패 시 빈 배열 반환
  }
}
