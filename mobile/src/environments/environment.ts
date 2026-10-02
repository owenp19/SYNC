const LAN_IP = '10.156.185.51';

export const environment = {
  production: false,
  apiUrl: `http://${LAN_IP}:8000/api`,
  socketUrl: `http://${LAN_IP}:8000`,
  livekitUrl: `ws://${LAN_IP}:7880`,
  livekitTokenEndpoint: `http://${LAN_IP}:8000/api/voice/token`
};

