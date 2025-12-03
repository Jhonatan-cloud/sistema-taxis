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

// 🔥 RADIO: canal ocupado / libre (solo uno habla)
let canalOcupado = false;      // true = alguien está hablando
let infoHablando = null;       // { rol, idTaxi, nombre }

// ---------------------- SOCKET.IO ----------------------
io.on("connection", (socket) => {
  console.log("Nuevo cliente conectado:", socket.id);

  // Registro de taxi
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

  // Actualizar ubicación
  socket.on("actualizarUbicacion", (data) => {
    if (taxis[socket.id]) {
      taxis[socket.id].lat = data.lat;
      taxis[socket.id].lng = data.lng;
      io.emit("actualizacionUbicaciones", taxis);
    }
  });

  // Asignar servicio (central)
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

  // Cambio de estado de servicio (taxi)
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

  // Chat texto
  socket.on("mensajeChat", (data) => {
    io.emit("mensajeChat", data);
  });

  // -------------------------------------------------
  // 🔥 RADIO: controlar canal ocupado/libre
  // data: { rol: "central"|"taxi", idTaxi?, nombre? }
  // -------------------------------------------------
  socket.on("canalOcupado", (data) => {
    if (!canalOcupado) {
      canalOcupado = true;
      infoHablando = {
        rol: data.rol,
        idTaxi: data.idTaxi || null,
        nombre: data.nombre || "",
        socketId: socket.id,
      };
      // avisar a todos quién habla
      io.emit("canalOcupado", infoHablando);
      socket.emit("puedesHablar"); // el que lo pidió, puede grabar
    } else {
      // canal ya ocupado
      socket.emit("canalRechazado");
    }
  });

  socket.on("canalLibre", () => {
    if (infoHablando && infoHablando.socketId === socket.id) {
      canalOcupado = false;
      infoHablando = null;
      io.emit("canalLibre");
    }
  });

  // 🔊 audio en streaming (chunks rápidos)
  // data: { rol, idTaxi?, chunk }
  socket.on("audioChunk", (data) => {
    if (!infoHablando || infoHablando.socketId !== socket.id) {
      // ignora si no es el que tiene el canal
      return;
    }
    // reenviar a todos MENOS al que habla
    socket.broadcast.emit("audioChunk", data);
  });

  // Desconexión
  socket.on("disconnect", () => {
    console.log("Cliente desconectado:", socket.id);
    if (taxis[socket.id]) {
      delete taxis[socket.id];
      enviarListaTaxis();
    }
    if (infoHablando && infoHablando.socketId === socket.id) {
      canalOcupado = false;
      infoHablando = null;
      io.emit("canalLibre");
    }
  });
});

function enviarListaTaxis() {
  io.emit("listaTaxis", taxis);
}

// Ruta base
app.get("/", (req, res) => {
  res.send("<h1>Sistema de taxis funcionando. Usa /central.html o /taxi.html</h1>");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});