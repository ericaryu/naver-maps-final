import time
import pandas as pd
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.service import Service

# 경로 설정
CSV_PATH = 'questions.csv'
CHROMEDRIVER_PATH = '/opt/homebrew/bin/chromedriver'
GPT_URL = "https://chat.openai.com/g/g-684cd73fb2808191979bff3cdccc70df-daeddongyeojido"  # 원하는 GPTs 주소

# 크롬 드라이버 초기화
options = webdriver.ChromeOptions()
options.add_argument("--user-data-dir=/Users/hyekyungryu/Library/Application Support/Google/Chrome")
options.add_argument("--profile-directory=Default")  # ← 여기만 수정!
options.add_argument("--start-maximized")

driver = webdriver.Chrome(service=Service(CHROMEDRIVER_PATH), options=options)

# GPTs 탭 열기
driver.get(GPT_URL)

# 유저가 로그인하거나 페이지가 로드될 시간 확보
print("⏳ GPT 페이지가 열렸습니다. 로그인 중이거나 로딩 중이라면 기다려주세요...")
time.sleep(10)  # 수동 로그인 또는 로딩 시간 확보

# 질문 불러오기 (D열: index 3)
df = pd.read_csv(CSV_PATH)
questions = df.iloc[:, 3].dropna().tolist()
answers = []

# 입력창 찾기
def find_input_box():
    try:
        return driver.find_element(By.TAG_NAME, "textarea")
    except:
        return None

# 최신 assistant 응답 추출
def get_last_response(timeout=20):
    for _ in range(timeout):
        try:
            blocks = driver.find_elements(By.CSS_SELECTOR, '[data-testid="conversation-turn"]')
            for block in reversed(blocks):
                try:
                    response_elem = block.find_element(By.CSS_SELECTOR, '[data-message-author-role="assistant"]')
                    response = response_elem.text
                    if response.strip():
                        return response
                except:
                    continue
        except:
            pass
        time.sleep(1)
    return "❌ 응답 없음"

# 질문 순차 입력 및 응답 저장
for idx, question in enumerate(questions):
    print(f"▶️ [{idx+1}] 질문: {question}")

    input_box = None
    wait_time = 0
    while input_box is None and wait_time < 10:
        input_box = find_input_box()
        time.sleep(1)
        wait_time += 1

    if input_box:
        input_box.send_keys(question)
        input_box.send_keys(Keys.ENTER)
        print("⌛ 응답 대기 중...")
        response = get_last_response()
        print(f"💬 응답: {response[:60]}...")
        answers.append(response)
        time.sleep(3)
    else:
        print("❌ 입력창을 찾지 못했습니다.")
        answers.append("❌ 입력창 없음")
        break

# 결과를 E열에 저장
df.loc[:len(answers)-1, 'GPT 응답'] = answers
df.to_csv(CSV_PATH, index=False)

print("✅ 모든 질문 완료 및 응답 저장 완료!")
driver.quit()
