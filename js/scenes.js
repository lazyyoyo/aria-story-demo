// 악녀빙의 1장 「수도원의 마차」 장면 그래프 (율리안 v2 플레이어 형식 재사용, 재집필본).
// 장면: {chapter, clip, sec, fate, shot, slice, subs:[[초, 화자, 한국어자막, 영어원문]], pages, learn, note, next | choice, gate}
//   화자가 ''인 줄은 지문: 음성 없이 자막만. 음성(립싱크) 대사는 클립당 최대 2문장·문장당 15단어.
//   pages: 검정 화면 흰 글씨 페이지(음성 없음, 탭으로 넘김). 서장 원작 읽기 전용. 도감 「원작 소설」 탭은 같은 배열을 재독한다.
//   정보 동등성: 주인공은 화면에서 플레이어에게 보여 준 정보로만 행동한다. 원작 지식의 출처는 전부 서장 pages다.
//     화자 라벨도 같다 — 서장에 이름이 없는 인물(하녀·정원사)은 화면에서 이름이 불린 뒤에야 이름으로 바뀐다.
//   choice: 타이머 없음. timeout은 구 플레이어 호환용 형식 필드(options[0]과 같은 go) — player.js가 c.time 없을 때
//     타이머를 걸지 않도록 고쳐야 한다(그대로 두면 setTimeout(NaN)이 즉시 발화해 timeout으로 자동 진행된다).
//   선택 장면의 gate는 어떤 선택지를 골랐든 플래그가 서 있으면 먼저 발동한다(a02·a10의 rude 우회가 이 동작에 기댄다).
//   option: {t, axis(상식|원작|빙의자), go, flag, sus(안주인 의심), st:{annie, trust}, note, learn, sliceGo}
//   장면의 st는 그 장면을 지날 때 상태창에 반영한다(a13 아버지 신뢰).
//   clip 없이 gate만 있는 장면은 지연 사망 판정용 통과 노드다.
//   세로 슬라이스: slice:true 장면만으로 진행. sliceGo/sliceNext가 있으면 슬라이스에선 그쪽으로 건너뛰고,
//     슬라이스 밖 장면·사망으로 가는 선택지와 게이트는 슬라이스에서 숨긴다/통과한다. sliceOnly 장면은 슬라이스에서만 쓴다.
// 사망(영상): {clip, sec, no, title, cause, kind(1=원작대로 죽음, 2=원작을 믿어서 죽음), subs, clue:[화자, 대사, 키프레임], echo, back, delayed, shot, slice}
// 사망(텍스트): clip·subs·shot 없이 text:[3~4줄] — 검정 화면에 흰 글씨로 서술만 띄운다. 나머지 필드는 영상 사망과 같다.
//   clue는 힌트 버튼 뒤에 숨긴다(지연 사망은 항상, 그 외는 같은 분기에서 두 번째 죽음부터 열린다).
// 진실 커튼: 1장은 "메리의 증언이 거짓"까지만. 로잘린은 끝까지 다정한 안주인, 메리는 겁먹은 하녀로만 그린다.
window.V2 = (() => {
  // 서장 원작 읽기 = 도감 「원작 소설」 탭. 앨리스 시점의 거짓 원작이다.
  const NOVEL = [
    '『웬트워스가의 두 딸』 1장.\n아홉 시 종이 울릴 때, 앨리스는 계단에서 굴러떨어졌다. 팔이 부러졌다. 계단 위에는 언니 아리아가 서 있었다.',
    '하녀 메리가 보았다고 했다. 아홉 시 종, 계단 위에서 펄럭이던 붉은 치맛자락.\n겁 많은 메리는 아리아가 노려보기만 해도 울음을 터뜨렸지만, 끝내 보았다고 떨면서 말했다.',
    '아리아는 사흘을 열병으로 앓았다. 그 곁에는 아무도 없었다.\n붉은 드레스의 악녀는 원하는 것을 늘 보석으로 샀다. 전속 하녀조차 그녀의 방 앞을 피해 다녔다.',
    '계모 로잘린은 자애로웠다.\n아리아는 계모의 문안마다 등을 돌렸고, 계모는 한숨 쉬며 물러났다. 그래도 하루도 문안을 거르지 않았다.',
    '아리아의 방에서 나온 일기장은 동생을 향한 질투로 가득했다.\n아버지 윌리엄 웬트워스 후작은 끝내 딸의 말을 들어 주지 않았다. 아리아가 내민 것은 언제나 눈물과 고함뿐이었으니까.',
    '정원사 노인은 첫 마님이 심은 장미만 돌보며, 아리아에게는 눈길도 주지 않았다.\n깨어난 지 사흘째 저녁, 홀에서 심판이 열렸다. 이튿날 아침, 수도원의 마차가 아리아를 싣고 떠났다.',
    '반년 뒤, 수도원에 전염병이 돌았다. 아리아는 그 겨울을 넘기지 못했다.\n\n나는 책을 덮고 잠들었다.',
  ];

  const S = {
    // ── 서장: 원작 읽기 ──
    p00: { chapter: '1장 「수도원의 마차」', slice: true, pages: NOVEL, subs: [], next: 'a01' },

    // ── D-3 · 깨어난 날 ──
    a01: { clip: 'a01', sec: 8, fate: 'D-3', slice: true, subs: [
      [0, '', '눈을 뜨니 낯선 천장이었다.', 'I woke to an unfamiliar ceiling.'],
      [2.5, '아리아', '이 얼굴… 아리아?', 'This face... Aria?'],
      [5, '', '어젯밤 덮은 소설 속, 그 악녀였다.', 'I was the villainess from the book I closed last night.'],
    ], shot: '9:16 vertical. A pale dark-haired young noblewoman wakes in a canopy bed, grabs a hand mirror and freezes at her own reflection; slow push-in, cold blue dawn through lace curtains. DIALOGUE: "This face... Aria?"',
    next: 'a02' },

    a02: { clip: 'a02', sec: 7, slice: true, subs: [
      [0, '하녀', '아가씨! 애니가 여기 있어요.', 'My lady, Annie is right here!'],
      [2.5, '애니', '사흘 밤낮을 열에 들떠 계셨어요.', 'You burned with fever for three days and nights.'],
    ], shot: '9:16 vertical. A young maid in a white apron with a brown braid rushes to the bedside, tearful with relief, clutching the blanket; handheld close-up, soft morning window light. DIALOGUE: "My lady, Annie is right here! You burned with fever for three days and nights."',
    choice: {
      prompt: '애니가 내 얼굴을 살핀다',
      options: [
        { t: '“여긴 어디야? 넌 누구야?”', axis: '상식', go: 'x01' },
        { t: '“목말라. 물부터 가져와.”', axis: '원작', go: 'a03', flag: 'rude', st: { annie: -1 }, sliceGo: 'a04', note: '애니가 움츠러들었다. “…네, 아가씨.”' },
        { t: '“곁에 있었구나. 고마워.”', axis: '빙의자', go: 'a03', st: { annie: 1 }, sliceGo: 'a04', note: '애니의 눈이 동그래졌다.' },
      ],
      timeout: { go: 'x01' },
    }, gate: { flag: 'rude', go: 'a03r' } },
    a03r: { subs: [], note: '앨리스는 괜찮냐고 물었다. 애니는 고개만 숙였다.', next: 'a04' },

    a03: { clip: 'a03', sec: 7, subs: [
      [0, '', '앨리스는 괜찮냐고 물었다.', 'I asked if Alice was all right.'],
      [2, '애니', '팔이 부러지셨대요. 메리가… 아가씨가 미는 걸 봤대요.', 'Her arm is broken. Mary says she saw you push her.'],
    ], shot: '9:16 vertical. The maid hesitates, lowers her eyes and twists her apron while answering in a whisper; tight close-up, candle light. DIALOGUE: "Her arm is broken. Mary says she saw you push her."',
    next: 'a04' },

    a04: { clip: 'a04', sec: 8, slice: true, subs: [
      [0, '', '저녁, 로잘린이 문안을 왔다.', 'That evening, Rosalyn came to see me.'],
      [2, '로잘린', '앨리스는 많이 놀랐어요. 아버지께는 내가 잘 말씀드려 볼게요.', "Alice was badly frightened. I'll speak to your father for you."],
    ], shot: '9:16 vertical. An elegant pale-gold-haired lady in her forties sits at the bedside, gently smoothing the blanket with a soft smile; slow dolly-in, warm evening lamplight. DIALOGUE: "Alice was badly frightened. I\'ll speak to your father for you."',
    choice: {
      prompt: '로잘린에게 뭐라고 하지',
      options: [
        { t: '“전 정말 밀지 않았어요.”', axis: '상식', go: 'x02', sus: 1, note: '로잘린이 나를 가만히 보았다. “…오늘은 좀 다르네요.”' },
        { t: '“그동안 죄송했어요.”', axis: '빙의자', go: 'x02', sus: 1, note: '로잘린이 나를 가만히 보았다. “…오늘은 좀 다르네요.”' },
        { t: '대답 없이 등을 돌린다', axis: '원작', go: 'a05', sliceGo: 's_sum', note: '로잘린은 한숨을 쉬고 물러났다.' },
      ],
      timeout: { go: 'x02', sus: 1 },
    } },

    // 슬라이스 전용: 일기·정원 구간을 건너뛰는 대신, 주인공이 손에 쥔 증거를 화면에서 먼저 보여 준다(정보 동등성).
    s_sum: { sliceOnly: true, slice: true, subs: [], note: '이틀 뒤, 내 손엔 일기와 정원사 제드의 증언이 있었다.', next: 'a11' },

    // ── D-2 · 둘째 날 ──
    a05: { clip: 'a05', sec: 7, fate: 'D-2', subs: [
      [0, '', '이튿날 아침, 복도에서 윌리엄과 마주쳤다.', 'The next morning, I met William in the corridor.'],
      [2, '윌리엄', '내일 저녁, 홀에서 결정한다. 할 말이 있거든 증거를 가져와라.', 'Tomorrow evening, the hall decides. If you have words, bring proof.'],
    ], shot: '9:16 vertical. A stern silver-haired lord with gray eyes stops in a long corridor without turning to face his daughter; static low angle, cool side light. DIALOGUE: "Tomorrow evening, the hall decides. If you have words, bring proof."',
    next: 'a06' },

    a06: { clip: 'a06', sec: 6, subs: [
      [0, '', '서랍 깊은 곳에서 일기장이 나왔다.', 'Deep in the drawer, I found a diary.'],
      [2.5, '아리아', '아리아의 일기…', "Aria's diary..."],
    ], shot: '9:16 vertical. The noblewoman pulls a worn leather diary from a bedside drawer and hesitates, thumb on the clasp, a fireplace glowing behind her; close-up on hands, then face. DIALOGUE: "Aria\'s diary..."',
    choice: {
      prompt: '이 일기, 어떻게 하지',
      options: [
        { t: '벽난로에 던져 태운다', axis: '빙의자', go: 'gz1', flag: 'burned', note: '일기장은 재가 되었다.' },
        { t: '아버지께 곧장 가져간다', axis: '상식', go: 'gz1', flag: 'seized', note: '윌리엄은 펼치지도 않았다. “네 글씨를 증거라 하느냐.”' },
        { t: '펼쳐서 그날 아침을 찾는다', axis: '상식', go: 'gz1', learn: '일기: “아홉 시 종. 정원에서 제드와 어머니의 장미를 옮겨 심음.”', note: '“아홉 시 종. 정원에서 제드와 어머니의 장미를 옮겨 심음.”' },
      ],
      timeout: { go: 'gz1', flag: 'burned' },
    } },
    // 일기를 읽지 않았으면 정원에 갈 이유를 모른다 → 정원 구간을 건너뛴다(지연 사망 x04·x08로 회수)
    gz1: { subs: [], gate: { flag: 'burned', go: 'a09' }, next: 'gz2' },
    gz2: { subs: [], gate: { flag: 'seized', go: 'a09' }, next: 'a07' },

    a07: { clip: 'a07', sec: 6, subs: [
      [0, '', '오후, 장미 덤불에 정원사 노인이 있었다.', 'That afternoon, an old gardener knelt among the roses.'],
      [2.5, '정원사', '…아가씨가 여긴 무슨 볼일이십니까요.', 'What brings you out here, miss, if I may ask?'],
    ], shot: '9:16 vertical. An old gardener in an earth-stained apron prunes a rose bush at golden hour and does not look up at the noblewoman behind him; medium shot, warm backlight. DIALOGUE: "What brings you out here, miss, if I may ask?"',
    choice: {
      prompt: '그날 아침을 떠올리게 해야 한다',
      options: [
        { t: '보석을 쥐여 주며 부탁한다', axis: '원작', go: 'x05' },
        { t: '“어머니 장미, 아직 피네요.”', axis: '빙의자', go: 'a08' },
      ],
      timeout: { go: 'x05' },
    } },

    a08: { clip: 'a08', sec: 7, subs: [
      [0, '아리아', '제드, 그날 아침 기억해?', 'Zed, do you remember that morning?'],
      [2.5, '제드', '아홉 시 종이 울릴 때, 아가씨는 저랑 장미 곁에 계셨습죠.', "At the nine o'clock bell, you were with me by the roses."],
    ], shot: '9:16 vertical. The old gardener finally turns, eyes wet, and answers the noblewoman over the roses; slow push-in on his weathered face, golden-hour light. DIALOGUE: "Zed, do you remember that morning?" / "At the nine o\'clock bell, you were with me by the roses."',
    next: 'a09' },

    a09: { clip: 'a09', sec: 6, subs: [
      [0, '', '밤, 앨리스의 방문이 열려 있었다.', "That night, Alice's door stood open."],
      [2, '앨리스', '언니… 난 언니 안 미워해.', "Sister... I don't hate you."],
    ], shot: '9:16 vertical. A frail silver-haired girl with a bandaged arm sits up in bed and looks at the doorway with wet eyes; static medium shot, single candle. DIALOGUE: "Sister... I don\'t hate you."',
    choice: {
      prompt: '앨리스에게 뭐라고 하지',
      options: [
        { t: '“사실대로 말해 줘.”', axis: '빙의자', go: 'x03' },
        { t: '“네가 꾸민 거지?”', axis: '원작', go: 'x03' },
        { t: '말없이 손을 잡는다', axis: '상식', go: 'a10', flag: 'aliceHand', note: '앨리스의 손끝이 잠깐 떨렸다.' },
      ],
      timeout: { go: 'x03' },
    } },

    // ── D-1 · 셋째 날 ──
    a10: { clip: 'a10', sec: 6, fate: 'D-1', subs: [
      [0, '', '셋째 날 아침이 밝았다.', 'The third morning came.'],
      [2, '애니', '오늘은 어떤 드레스를 꺼낼까요, 아가씨?', 'Which gown shall I bring today, my lady?'],
    ], shot: '9:16 vertical. The maid opens a tall wardrobe of gowns, crimson, pale blue and gray, and looks back at her mistress; wide shot then rack focus to the gowns, morning light. DIALOGUE: "Which gown shall I bring today, my lady?"',
    // 가짜 분기: 셋 다 합류. 붉은 드레스만 심판에서 x06으로 회수된다. rude면 애니가 소문을 전하지 않는다(gate).
    choice: {
      prompt: '오늘은 무엇을 입지',
      options: [
        { t: '피처럼 붉은 드레스를 입는다', axis: '원작', go: 'a10b', flag: 'red', note: '거울 속에서 악녀가 웃었다.' },
        { t: '수수한 회색 드레스를 입는다', axis: '상식', go: 'a10b' },
        { t: '단정한 푸른 드레스를 입는다', axis: '빙의자', go: 'a10b' },
      ],
      timeout: { go: 'a10b', flag: 'red' },
    }, gate: { flag: 'rude', go: 'a11' } },

    a10b: { clip: 'a10b', sec: 6, subs: [
      [0, '애니', '하인들이 수군거려요. 메리가 처음엔 열 시라 했대요.', 'The servants are whispering. Mary first said ten o\'clock.'],
    ], shot: '9:16 vertical. The maid laces the back of the gown and leans in to whisper over her mistress\'s shoulder in the mirror; mirror two-shot, morning light. DIALOGUE: "The servants are whispering. Mary first said ten o\'clock."',
    next: 'a11' },

    a11: { clip: 'a11', sec: 5, slice: true, subs: [
      [0, '', '심판 직전, 복도 끝에 메리가 있었다.', 'Just before the judgment, Mary stood at the corridor\'s end.'],
      [2, '메리', '…아, 아가씨.', '...M-my lady.'],
    ], shot: '9:16 vertical. A freckled young maid alone at the end of a dim corridor flinches and lowers her eyes as the noblewoman approaches; long lens, cold window light. DIALOGUE: "...M-my lady."',
    choice: {
      prompt: '메리가 눈을 피한다',
      options: [
        { t: '불러 세워서 따져 묻는다', axis: '빙의자', go: 'x07' },
        { t: '그대로 홀로 걸어간다', axis: '상식', go: 'a12' },
      ],
      timeout: { go: 'x07' },
    } },

    a12: { clip: 'a12', sec: 8, slice: true, subs: [
      [0, '', '저녁, 홀에서 메리가 앞으로 나섰다.', 'That evening in the hall, Mary stepped forward.'],
      [2.5, '메리', '아, 아가씨가 계단 위에서 미셨어요. 붉은 치맛자락이…', 'M-my lady pushed her on the stairs. A red skirt...'],
    ], shot: '9:16 vertical. The freckled maid trembles in the center of a candlelit great hall, eyes down, as servants and the silver-haired lord watch; slow arc around her, chandelier light. DIALOGUE: "M-my lady pushed her on the stairs. A red skirt..."',
    choice: {
      prompt: '메리의 말을 어떻게 받지',
      options: [
        { t: '가진 증거를 곧장 내민다', axis: '상식', go: 'x10' },
        { t: '“아홉 시 종이었지? 확실해?”', axis: '빙의자', go: 'g1' },
        { t: '“거짓말 마, 이 천한 것!”', axis: '원작', go: 'x11' },
      ],
      timeout: { go: 'x10' },
    } },
    // 지연 사망 판정: 첫날의 하대 → 애니가 입을 닫음, 태운 일기·넘긴 일기 → 기록 없음, 붉은 드레스 → 증언에 몸이 붙는다
    g1: { slice: true, subs: [], gate: { flag: 'rude', go: 'x09' }, next: 'g2' },
    g2: { slice: true, subs: [], gate: { flag: 'burned', go: 'x04' }, next: 'g3' },
    g3: { slice: true, subs: [], gate: { flag: 'seized', go: 'x08' }, next: 'g4' },
    g4: { slice: true, subs: [], gate: { flag: 'red', go: 'x06' }, next: 'a13' },

    a13: { clip: 'a13', sec: 8, slice: true, st: { trust: 1 }, subs: [
      [0, '', '메리는 아홉 시 종이라고 했다.', 'Mary swore it was the nine o\'clock bell.'],
      [2.5, '제드', '그 종이 울릴 때, 아가씨는 저랑 장미 곁에 계셨습죠.', 'When that bell rang, my lady was with me by the roses.'],
      [5.5, '윌리엄', '“아홉 시 종, 장미를 옮겨 심음.” …네 글씨군.', 'Nine bells, moving the roses... your hand.'],
    ], shot: '9:16 vertical. In the candlelit hall the old gardener speaks up while the silver-haired lord reads an open diary, his face slowly changing; cut between them, warm chandelier light. DIALOGUE: "When that bell rang, my lady was with me by the roses." / "Nine bells, moving the roses... your hand."',
    next: 'a14' },

    a14: { clip: 'a14', sec: 7, fate: '해제', slice: true, subs: [
      [0, '', '메리가 무릎을 꿇었다.', 'Mary fell to her knees.'],
      [2.5, '윌리엄', '…마차를 물려라.', '...Send the carriage away.'],
    ], shot: '9:16 vertical. The maid collapses to her knees as the lord closes the diary and turns to the steward; slow pull-back revealing the noblewoman standing alone, candlelight. DIALOGUE: "...Send the carriage away."',
    next: 'end1' },
  };

  const D = {
    x01: { clip: 'x01', sec: 7, no: 1, kind: 1, slice: true, title: '정신이 온전치 못한 딸', cause: '애니를 알아보지 못했다. 의원은 열이 머리를 상하게 했다고 적었다',
      subs: [
        [0, '애니', '마님! 아가씨가 저를 못 알아보세요!', "Madam! My lady doesn't know me!"],
        [3, '', '그날 오후, 심판도 없이 마차가 왔다.', 'That afternoon, the carriage came without a trial.'],
      ],
      shot: '9:16 vertical. The maid runs out of the bedroom crying for help; cut to a black carriage in a gray courtyard as the noblewoman is led out in a shawl; wide shot, overcast. DIALOGUE: "Madam! My lady doesn\'t know me!"',
      clue: ['애니', '사흘 밤낮을 열에 들떠 계셨어요.', 'a02'],
      echo: ['애니', '제 이름을 알려 드렸잖아요, 아가씨.'], back: 'a02' },
    x02: { no: 2, kind: 1, slice: true, title: '따뜻한 차', cause: '늘 등을 돌리던 딸이 로잘린에게 마음을 보였다',
      text: ['그날 밤부터 메리가 곁을 지켰다.', '차는 매일 저녁 따뜻하게 왔다.', '방을 나서지 못한 채 사흘째 아침이 밝았다.', '마차가 왔다.'],
      clue: ['원작 소설', '아리아는 계모의 문안마다 등을 돌렸고, 계모는 한숨 쉬며 물러났다.', 'a04'],
      echo: ['애니', '예전처럼 등만 돌리셨으면, 마님도 그냥 물러나셨을 텐데요.'], back: 'a04' },
    x03: { no: 3, kind: 1, title: '병실의 비명', cause: '붕대 감은 동생을 다그쳤다',
      text: ['앨리스가 울음을 터뜨렸다.', '메리가 복도로 달려 나가 사람을 불렀다.', '심판은 그날 밤으로 앞당겨졌다.', '이튿날 새벽, 마차가 왔다.'],
      clue: ['앨리스', '언니… 난 언니 안 미워해.', 'a09'],
      echo: ['애니', '붕대 감고 누운 아가씨 앞이었어요. 누가 봐도 그렇게 보여요.'], back: 'a09' },
    x04: { no: 4, kind: 2, delayed: true, title: '타 버린 일기', cause: '원작을 믿고, 읽지도 않은 일기를 태웠다',
      text: ['메리의 아홉 시 앞에 내놓을 것이 없었다.', '그날 아침을 적은 한 줄은 벽난로 재 속에 있었다.', '윌리엄은 더 묻지 않았다.', '이튿날 새벽, 마차가 왔다.'],
      clue: ['원작 소설', '아리아의 방에서 나온 일기장은 동생을 향한 질투로 가득했다.', 'a06'],
      echo: ['윌리엄', '네 손으로 적은 그날 아침이 있었다면, 들어는 보았을 것이다.'], back: 'a06' },
    x05: { no: 5, kind: 1, title: '값을 매긴 증언', cause: '첫 마님의 장미만 돌보던 정원사에게 보석을 내밀었다',
      text: ['정원사는 받은 보석을 그대로 윌리엄에게 가져갔다.', '증인을 사려 한 딸에게 심판은 열리지 않았다.', '마차는 그날 밤 왔다.'],
      clue: ['원작 소설', '정원사 노인은 첫 마님이 심은 장미만 돌보며, 아리아에게는 눈길도 주지 않았다.', 'a07'],
      echo: ['정원사', '마님 은혜로 할 말을, 값으로 사려 하십니까요.'], back: 'a07' },
    x06: { clip: 'x06', sec: 7, no: 6, kind: 1, delayed: true, title: '붉은 치맛자락', cause: '심판의 날, 붉은 드레스를 입었다',
      subs: [
        [0, '메리', '그날도 저 붉은 치맛자락이었어요.', 'It was that same red skirt that day.'],
        [3, '제드', '늙은 눈이라… 이젠 모르겠습죠.', "These old eyes... can't be sure anymore."],
      ],
      shot: '9:16 vertical. The trembling maid points at the noblewoman\'s crimson gown; the old gardener squints, doubt spreading over his face; rack focus from finger to gown, candlelight. DIALOGUE: "It was that same red skirt that day." / "These old eyes... can\'t be sure anymore."',
      clue: ['원작 소설', '아홉 시 종, 계단 위에서 펄럭이던 붉은 치맛자락.', 'a10'],
      echo: ['애니', '하필 그날, 그 드레스를…'], back: 'a10' },
    x07: { clip: 'x07', sec: 7, no: 7, kind: 2, slice: true, title: '입막음', cause: '심판 직전, 증인 메리를 따로 다그쳤다',
      subs: [
        [0, '메리', '마님! 아리아 아가씨가 증언을 거두라고 저를…!', 'Madam! Lady Aria told me to take back my word!'],
        [3.5, '', '메리는 울면서도 말을 바꾸지 않았다.', 'Mary wept, but never changed her story.'],
      ],
      shot: '9:16 vertical. The freckled maid flees down a corridor in tears and throws herself at the feet of the elegant lady of the house; handheld follow shot, gray daylight. DIALOGUE: "Madam! Lady Aria told me to take back my word!"',
      clue: ['원작 소설', '끝내 보았다고 떨면서 말했다.', 'a11'],
      echo: ['애니', '우는 것과 무너지는 건 달라요, 아가씨.'], back: 'a11' },
    x08: { no: 8, kind: 1, delayed: true, title: '질투의 일기', cause: '읽지도 않은 일기를 아버지에게 먼저 넘겼다',
      text: ['윌리엄은 압수한 일기를 처음부터 읽었다.', '“앨리스가 미웠다.” 그 줄이 홀에 울렸다.', '아홉 시 종의 한 줄은 아무도 듣지 않았다.', '이튿날 새벽, 마차가 왔다.'],
      clue: ['원작 소설', '아리아의 방에서 나온 일기장은 동생을 향한 질투로 가득했다.', 'a06'],
      echo: ['애니', '그 일기, 아가씨가 먼저 읽어 보셨어야죠.'], back: 'a06' },
    x09: { clip: 'x09', sec: 7, no: 9, kind: 1, delayed: true, title: '아무도 없는 방', cause: '깨어난 아침, 애니에게 원작의 아리아처럼 굴었다',
      subs: [
        [0, '', '홀 안에 내 편은 아무도 없었다.', 'No one in the hall stood for me.'],
        [2.5, '윌리엄', '네 하녀조차 입을 닫는구나. 마차는 새벽이다.', 'Even your own maid keeps silent. The carriage leaves at dawn.'],
      ],
      shot: '9:16 vertical. The noblewoman stands alone in the hall as every servant, her own maid among them, looks at the floor; slow crane up, cold candlelight. DIALOGUE: "Even your own maid keeps silent. The carriage leaves at dawn."',
      clue: ['원작 소설', '전속 하녀조차 그녀의 방 앞을 피해 다녔다.', 'a02'],
      echo: ['애니', '그날 아침, 물 대신 다른 말을 해 주셨다면요.'], back: 'a02' },
    x10: { no: 10, kind: 1, slice: true, title: '바뀐 종소리', cause: '메리의 시각을 못 박기 전에 증거를 내밀었다',
      text: ['메리는 종이 열 번 울렸다고 말을 바꿨다.', '아홉 시의 증거는 아무것도 증명하지 못했다.', '심판은 그대로 끝났다.', '이튿날 새벽, 마차가 왔다.'],
      clue: ['원작 소설', '아홉 시 종, 계단 위에서 펄럭이던 붉은 치맛자락.', 'a12'],
      echo: ['애니', '메리가 먼저 시각을 말하게 하셨어야 해요.'], back: 'a12' },
    x11: { no: 11, kind: 1, slice: true, title: '심판의 고함', cause: '심판의 자리에서 소리를 질렀다',
      text: ['심판의 자리에서 아리아는 소리를 질렀다.', '윌리엄은 더 묻지 않고 자리에서 일어섰다.', '하인들은 늘 보던 아가씨를 보았다.', '이튿날 새벽, 마차가 왔다.'],
      clue: ['원작 소설', '아리아가 내민 것은 언제나 눈물과 고함뿐이었으니까.', 'a12'],
      echo: ['애니', '예전의 아가씨처럼 소리를 지르셨어요.'], back: 'a12' },
  };

  const END = {
    end1: { title: '1장 끝 「수도원의 마차」', lines: ['메리의 증언은 거짓이었다. 원작이 처음으로 어긋났다.', '그렇다면 이 소설은, 어디까지가 거짓일까.', '2장은 준비 중입니다.'] },
  };

  // 상태창(빙의물 시스템창). 운명 카운트다운은 장면의 fate로, 나머지는 option의 st/sus로 움직인다.
  // 「수도원행 D-3」의 근거는 서장 페이지 6(깨어난 지 사흘째 저녁 심판, 이튿날 아침 마차)이다.
  const STATUS = [
    { key: 'fate', label: '운명: 수도원행', init: 'D-3' },
    { key: 'trust', label: '아버지 신뢰', init: 0 },
    { key: 'sus', label: '안주인 의심', init: 0 },
    { key: 'annie', label: '애니 호감', init: 0 },
  ];

  const DEATH_TOTAL = 11;
  return { S, D, END, NOVEL, STATUS, DEATH_TOTAL, start: 'p00' };
})();
