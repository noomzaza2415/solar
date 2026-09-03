# ---- build ----
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY SolarPushNotifications/SolarPushNotifications.csproj SolarPushNotifications/
RUN dotnet restore SolarPushNotifications/SolarPushNotifications.csproj

COPY SolarPushNotifications/ SolarPushNotifications/
RUN dotnet publish SolarPushNotifications/SolarPushNotifications.csproj \
    -c Release \
    -o /app/publish \
    --no-restore

# ---- runtime ----
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

# สำคัญมาก: service ตัดสินว่า "วันนี้" คือวันไหนจาก DateTime.Now
# ถ้าปล่อยให้ container เป็น UTC ช่วงเที่ยงคืน-7 โมงเช้าไทยจะไปอ่านคีย์ของเมื่อวาน
# ทำให้เช็คผิดวันและแจ้งเตือนเพี้ยนทั้งวัน
ENV TZ=Asia/Bangkok
# image ของ aspnet ไม่มีทั้ง curl และ wget ติดมา ต้องลงเองไม่งั้น healthcheck จะไม่ผ่านตลอดกาล
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime \
    && echo $TZ > /etc/timezone \
    && apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false
ENV ASPNETCORE_URLS=http://0.0.0.0:5155

# push token กับสถานะการแจ้งเตือนถูกเก็บที่นี่ ต้อง mount volume ทับ ไม่งั้นข้อมูลหายทุกครั้งที่ deploy ใหม่
ENV SolarAlerts__StateDirectory=/app/state
RUN mkdir -p /app/state

COPY --from=build /app/publish .

EXPOSE 5155

# รันด้วย user ที่ไม่ใช่ root และให้สิทธิ์เขียนโฟลเดอร์ state
RUN chown -R app:app /app
USER app

ENTRYPOINT ["dotnet", "SolarPushNotifications.dll"]
