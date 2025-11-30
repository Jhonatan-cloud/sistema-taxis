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
let taxis = [];

// servicios
let servicios = [];

// 🔥 CONTROL DE RADIO (solo uno habla a la vez)
let currentSpeaker = null; // socket.id del que habla, null si nadie

// --------------------------------------------------------------------
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

  // ---------------------- CHAT ----------------------------
  socket.on("mensajeChat", (data) => {
    io.emit("mensajeChat", data);
  });

  // --------------------------------------------------------------------
  // 🔥🔥🔥 RADIO PTT: CONTROL DE QUIÉN PUEDE HABLAR 🔥🔥🔥
  // --------------------------------------------------------------------

  // Cliente pide permiso para hablar
  socket.on("ptt:request", (data) => {
    if (!currentSpeaker) {
      // Nadie está hablando → se lo damos
      currentSpeaker = socket.id;
      console.log("Turno concedido a:", socket.id);
      socket.emit("ptt:granted");
      socket.broadcast.emit("ptt:busy", {
        speaker: socket.id,
        rol: data.rol,
        idTaxi: data.idTaxi || null,
      });
    } else {
      // Canal ocupado
      socket.emit("ptt:denied");
    }
  });

  // Cliente suelta el botón → libera el canal
  socket.on("ptt:release", () => {
    if (currentSpeaker === socket.id) {
      console.log("Turno liberado por:", socket.id);
      currentSpeaker = null;
      io.emit("ptt:free");
    }
  });

  // Recibir audio chunks solo del que habla
  socket.on("audioChunk", (data) => {
    if (socket.id !== currentSpeaker) return; // ignorar si no es el dueño del turno

    // Reenviar chunks a todos menos al hablante
    socket.broadcast.emit("audioChunk", data);
  });

  // ---------------------- DESCONEXIÓN ----------------------------
  socket.on("disconnect", () => {
    console.log("Cliente desconectado:", socket.id);

    if (taxis[socket.id]) {
      delete taxis[socket.id];
      enviarListaTaxis();
    }

    // Si el que hablaba se desconecta → liberar canal
    if (currentSpeaker === socket.id) {
      currentSpeaker = null;
      io.emit("ptt:free");
    }
  });
});

function enviarListaTaxis() {
  io.emit("listaTaxis", taxis);
}

app.get("/", (req, res) => {
  res.send("<h1>Sistema de taxis funcionando. Usa /central.html o /taxi.html</h1>");
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log("Servidor corriendo en el puerto", PORT);
});
