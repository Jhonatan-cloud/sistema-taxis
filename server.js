// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir carpeta "public"
app.use(express.static("public"));

// taxis[socketId] = { idTaxi, nombre, estado, lat, lng }
let taxis = {};

// servicios: { id, taxiSocketId, taxiNombre, direccion, estado }
let servicios = [];

// 🔥 CONTROL RADIO: solo uno habla a la vez
let currentSpeaker = null;      // socket.id que tiene el turno
let currentSpeakerInfo = null;  // { rol, idTaxi, nombre }

io.on("connection", (socket) => {
  console.log("Nuevo cliente conectado:", socket.id);

  // ---------------------- REGISTRO TAXI ----------------------
  socket.on("registrarTaxi", (data) => {
    taxis[socket.id] = {
      idTaxi: data.idTaxi,
      nombre: data.nombre,
      estado: "disponible",
      lat: null,
      lng: null,
    };
    enviarListaTaxis();
  });

  // ---------------------- UBICACIÓN ----------------------------
  socket.on("actualizarUbicacion", (data) => {
    if (taxis[socket.id]) {
      taxis[socket.id].lat = data.lat;
      taxis[socket.id].lng = data.lng;
      io.emit("actualizacionUbicaciones", taxis);
    }
  });

  // ---------------------- SERVICIOS ----------------------------
  socket.on("asignarServicio", (data) => {
    const taxi = taxis[data.socketIdTaxi];
    if (!taxi) return;

    const servicio = {
      id: Date.now(),
      taxiSocketId: data.socketIdTaxi,
      taxiNombre: taxi.nombre,
      direccion: data.direccion,
      estado: "asignado",
    };

    servicios.push(servicio);
    taxi.estado = "ocupado";

    io.to(data.socketIdTaxi).emit("nuevoServicio", servicio);

    enviarListaTaxis();
    io.emit("listaServicios", servicios);
  });

  socket.on("estadoServicio", (data) => {
    const servicio = servicios.find((s) => s.id === data.idServicio);
    if (!servicio) return;

    servicio.estado = data.nuevoEstado;

    if (data.nuevoEstado === "finalizado" && taxis[socket.id]) {
      taxis[socket.id].estado = "disponible";
    }

    enviarListaTaxis();
    io.emit("listaServicios", servicios);
  });

  // ---------------------- CHAT TEXTO ----------------------------
  socket.on("mensajeChat", (data) => {
    io.emit("mensajeChat", data);
  });

  // --------------------------------------------------------------------
  // 🔥 RADIO PTT
  // --------------------------------------------------------------------
  // data: { rol: "central" | "taxi", idTaxi?, nombre? }
  socket.on("ptt:request", (data) => {
    if (!currentSpeaker) {
      currentSpeaker = socket.id;
      currentSpeakerInfo = {
        rol: data.rol,
        idTaxi: data.idTaxi || null,
        nombre: data.nombre || "",
      };
      socket.emit("ptt:granted");
      io.emit("ptt:speaker", currentSpeakerInfo); // todos ven quién habla
    } else {
      socket.emit("ptt:denied");
    }
  });

  socket.on("ptt:release", () => {
    if (currentSpeaker === socket.id) {
      currentSpeaker = null;
      currentSpeakerInfo = null;
      io.emit("ptt:released");
    }
  });

  // 🔊 Audio por pulsación (ArrayBuffer)
  // data: { rol, idTaxi?, audio: ArrayBuffer }
  socket.on("audioMensaje", (data) => {
    if (socket.id !== currentSpeaker) return; // solo habla quien tiene turno
    // Reenviar a todos MENOS al hablante
    socket.broadcast.emit("audioMensaje", data);
  });

  // ---------------------- DESCONEXIÓN ----------------------------
  socket.on("disconnect", () => {
    if (taxis[socket.id]) {
      delete taxis[socket.id];
      enviarListaTaxis();
    }
    if (currentSpeaker === socket.id) {
      currentSpeaker = null;
      currentSpeakerInfo = null;
      io.emit("ptt:released");
    }
  });
});

function enviarListaTaxis() {
  io.emit("listaTaxis", taxis);
}

app.get("/", (req, res) => {
  res.send("<h1>Sistema de taxis funcionando. Usa /central.html o /taxi.html</h1>");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});