import json
import random
import pandas as pd
from datetime import timedelta

# ==========================================
# 核心升级 1：精细化线路分段映射 (Finer Line Segmentation)
# 将超长线路拆分为多段，例如6号线西段、中段、东段分别赋予不同的人流属性
# ==========================================
SEGMENT_MAP = {
    "1号线-八通线": [
        {"name": "1号线-八通线_西段(石景山)", "type": "commuter", "ratio": 0.25},
        {"name": "1号线-八通线_中段(核心区)", "type": "core", "ratio": 0.40},
        {"name": "1号线-八通线_东段(通州)", "type": "commuter", "ratio": 0.35}
    ],
    "6号线": [
        {"name": "6号线_西段(石景山/海淀)", "type": "commuter", "ratio": 0.25},
        {"name": "6号线_中段(核心区)", "type": "core", "ratio": 0.40},
        {"name": "6号线_东段(常营/通州)", "type": "commuter", "ratio": 0.35}
    ],
    "10号线": [
        {"name": "10号线_北/东段(CBD/中关村)", "type": "core", "ratio": 0.60},
        {"name": "10号线_南/西段(丰台/海淀南)", "type": "commuter", "ratio": 0.40}
    ],
    "14号线": [
        {"name": "14号线_西/南段(丰台/丽泽)", "type": "commuter", "ratio": 0.35},
        {"name": "14号线_中/东段(大望路/望京)", "type": "core", "ratio": 0.65}
    ]
}

DEFAULT_CATEGORIES = {
    "commuter": ["5号线", "13号线", "昌平线", "房山线", "亦庄线", "燕房线", "15号线", "S1线", "亦庄T1线", "西郊线", "8号线"],
    "hub": ["7号线", "9号线", "首都机场线", "大兴机场线", "16号线"]
} # 其余无明确切割的默认视为 core 核心线

def get_segments(line_name):
    if line_name in SEGMENT_MAP:
        return SEGMENT_MAP[line_name]
    
    ctype = "core"
    if any(c in line_name for c in DEFAULT_CATEGORIES["commuter"]): ctype = "commuter"
    if any(c in line_name for c in DEFAULT_CATEGORIES["hub"]): ctype = "hub"
    return [{"name": line_name, "type": ctype, "ratio": 1.0}]

# ==========================================
# 基础定义：时间权重 & 节假日
# ==========================================
def normalize(w):
    s = sum(w)
    return [x/s if s else 0 for x in w]

weight_commuter = [0] * 24; weight_commuter[5:23] = [0.02, 0.06, 0.22, 0.18, 0.05, 0.03, 0.03, 0.03, 0.03, 0.03, 0.04, 0.06, 0.20, 0.18, 0.05, 0.03, 0.02, 0.01]
weight_core = [0] * 24; weight_core[5:23] = [0.01, 0.04, 0.14, 0.12, 0.07, 0.06, 0.05, 0.05, 0.05, 0.05, 0.06, 0.07, 0.13, 0.11, 0.06, 0.04, 0.02, 0.01]
weight_hub = [0] * 24; weight_hub[5:23] = [0.02, 0.04, 0.10, 0.09, 0.08, 0.07, 0.07, 0.07, 0.07, 0.08, 0.08, 0.08, 0.10, 0.09, 0.07, 0.06, 0.04, 0.02]
weight_weekend = [0] * 24; weight_weekend[5:23] = [0.01, 0.02, 0.04, 0.06, 0.08, 0.09, 0.09, 0.08, 0.08, 0.08, 0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.02, 0.01]

holidays_spring = [('2019-02-04', '2019-02-10'), ('2020-01-24', '2020-02-02'), ('2021-02-11', '2021-02-17'), ('2022-01-31', '2022-02-06'), ('2023-01-21', '2023-01-27'), ('2024-02-10', '2024-02-17'), ('2025-01-28', '2025-02-04')]
holidays_other = []
for y in range(2019, 2026): holidays_other.extend([(f'{y}-05-01', f'{y}-05-05'), (f'{y}-10-01', f'{y}-10-07')])

def get_day_status(dt):
    if pd.isna(dt): return "normal", False
    for start_str, end_str in holidays_spring + holidays_other:
        start, end = pd.to_datetime(start_str), pd.to_datetime(end_str)
        is_sf = (start_str, end_str) in holidays_spring
        if start - timedelta(days=2) <= dt < start: return "exodus", is_sf
        if end - timedelta(days=1) <= dt <= end + timedelta(days=1): return "return", is_sf
        if start <= dt <= end: return "holiday", is_sf
    if dt.weekday() >= 5: return "weekend", False
    return "normal", False

# ==========================================
# 核心升级 2：方向性 (Directionality) 计算逻辑
# ==========================================
def get_inbound_ratio(hour, segment_type, day_status):
    # 周末、节假日方向性不明显，基本对半开，微小扰动
    if day_status in ["weekend", "holiday", "exodus", "return"] or segment_type == "hub":
        return 0.5 + random.uniform(-0.05, 0.05)
    
    if segment_type == "commuter":
        # 睡城通勤线：早高峰大量进城(80-90%)，晚高峰大量出城(进城仅10-20%)
        if 7 <= hour <= 9: return random.uniform(0.80, 0.90)
        if 17 <= hour <= 19: return random.uniform(0.10, 0.20)
    elif segment_type == "core":
        # 核心商务线：潮汐差较小，早进城(60%)，晚出城(40%进城)
        if 7 <= hour <= 9: return random.uniform(0.55, 0.65)
        if 17 <= hour <= 19: return random.uniform(0.35, 0.45)
    
    # 其余平峰时间对半分
    return 0.5 + random.uniform(-0.05, 0.05)

# ==========================================
# 核心升级 3：外部事件系统 (Weather & Incidents)
# ==========================================
def generate_weather():
    rnd = random.random()
    if rnd < 0.05: return "snow", 1.25 # 大雪导致路面瘫痪，地铁客流骤增25%
    if rnd < 0.20: return "rain", 1.15 # 降雨，客流增加15%
    return "normal", 1.0

def generate_event(day_status):
    # 以 7% 的概率在某些日子触发大型活动
    if day_status in ["weekend", "holiday", "normal"] and random.random() < 0.07:
        events = [
            {"name": "五棵松演唱会(进场)", "target": "1号线-八通线_西段", "hour": 18, "multiplier": 3.0}, 
            {"name": "五棵松演唱会(散场)", "target": "1号线-八通线_西段", "hour": 22, "multiplier": 4.0}, 
            {"name": "工体大型赛事", "target": "2号线", "hour": 19, "multiplier": 2.5},
            {"name": "国家体育场活动散场", "target": "8号线", "hour": 22, "multiplier": 3.5}
        ]
        return random.choice(events)
    return None

# ==========================================
# 主流程：数据重构与生成
# ==========================================
with open('bj_subway_flows.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

hourly_data = []

for entry in data:
    date_str = entry['date']
    dt = pd.to_datetime(date_str, errors='coerce')
    day_status, is_sf = get_day_status(dt)
    
    # 每天分配独立的天气与突发事件
    weather_cond, weather_multiplier = generate_weather()
    daily_event = generate_event(day_status)
    
    day_hourly = {
        "date": date_str, 
        "day_type": day_status, 
        "weather": weather_cond,
        "event": daily_event["name"] if daily_event else "none",
        "segments": {} # 使用段落替代原本的整条 lines
    }
    
    for line, hourly_dict in entry['lines'].items():
        daily_total = sum(hourly_dict.values())
        segments = get_segments(line)
        
        for seg in segments:
            seg_name = seg["name"]
            seg_type = seg["type"]
            seg_ratio = seg["ratio"]
            
            # 分区段日总客流量计算
            seg_daily_total = daily_total * seg_ratio * weather_multiplier
            
            # 基础乘数计算
            volume_multiplier = 1.0
            if day_status in ["weekend", "holiday"]: base_weights = weight_weekend
            else:
                if seg_type == "commuter": base_weights = weight_commuter
                elif seg_type == "core": base_weights = weight_core
                else: base_weights = weight_hub
                
            if day_status in ["exodus", "return"]:
                if seg_type == "hub": volume_multiplier = 1.60; base_weights = weight_weekend
                elif seg_type == "commuter": volume_multiplier = 0.70
                else: volume_multiplier = 0.90
            elif day_status == "holiday":
                if is_sf: volume_multiplier = 0.20 if seg_type == "commuter" else (0.40 if seg_type == "core" else 0.80)
                else: volume_multiplier = 0.50 if seg_type == "commuter" else (0.85 if seg_type == "core" else 1.10)
            elif day_status == "weekend":
                volume_multiplier = 0.60 if seg_type == "commuter" else 0.85

            noisy_weights = normalize([w * random.uniform(0.9, 1.1) if w > 0 else 0 for w in base_weights])
            
            seg_hourly = {}
            for hour in range(5, 23):
                time_range_str = f"{hour}:00-{hour+1}:00"
                
                # 步骤1：计算总流量
                hour_flow = seg_daily_total * volume_multiplier * noisy_weights[hour]
                
                # 步骤2：拦截外部突发事件（匹配线路名与小时）
                if daily_event and daily_event["target"] in seg_name and hour == daily_event["hour"]:
                    hour_flow *= daily_event["multiplier"]
                
                # 步骤3：计算方向占比（进出站拆分）
                inbound_ratio = get_inbound_ratio(hour, seg_type, day_status)
                
                seg_hourly[time_range_str] = {
                    "inbound": round(hour_flow * inbound_ratio, 2),
                    "outbound": round(hour_flow * (1.0 - inbound_ratio), 2),
                    "total": round(hour_flow, 2)
                }
                    
            day_hourly["segments"][seg_name] = seg_hourly
            
    hourly_data.append(day_hourly)

with open('bj_subway_digital_twin_flows.json', 'w', encoding='utf-8') as f:
    json.dump(hourly_data, f, ensure_ascii=False, indent=2)

print("包含全景物理特征的数据处理完成！")