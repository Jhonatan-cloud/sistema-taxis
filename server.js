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

// 🔒 RADIO: solo uno habla a la vez
let canalOcupado = false;   // true = alguien está hablando
let infoCanal = null;       // { rol, idTaxi, nombre, socketId }

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

  // 🔒 RADIO: pedir canal
  // data: { rol: "central"|"taxi", idTaxi?, nombre? }
  socket.on("solicitarCanal", (data) => {
    if (!canalOcupado) {
      canalOcupado = true;
      infoCanal = {
        rol: data.rol,
        idTaxi: data.idTaxi || null,
        nombre: data.nombre || "",
        socketId: socket.id,
      };
      console.log("Canal ocupado por:", infoCanal);

      // avisar quién está hablando
      io.emit("estadoCanal", {
        ocupado: true,
        rol: infoCanal.rol,
        idTaxi: infoCanal.idTaxi,
        nombre: infoCanal.nombre,
      });

      // al que pidió, le concedemos hablar
      socket.emit("canalConcedido");
    } else {
      // ya hay alguien hablando
      socket.emit("canalDenegado");
    }
  });

  // 🔓 RADIO: liberar canal
  socket.on("liberarCanal", () => {
    if (infoCanal && infoCanal.socketId === socket.id) {
      console.log("Canal liberado por:", infoCanal);
      canalOcupado = false;
      infoCanal = null;

      io.emit("estadoCanal", {
        ocupado: false,
      });
    }
  });

  // 🔊 AUDIO (igual que antes: un Blob por pulsación)
  // data: { rol: "central"|"taxi", idTaxi?, para, audio: Blob }
  socket.on("audioMensaje", (data) => {
    // reenviar a TODOS (central y taxis)
    io.emit("audioMensaje", data);
  });

  // Desconexión
  socket.on("disconnect", () => {
    console.log("Cliente desconectado:", socket.id);
    if (taxis[socket.id]) {
      delete taxis[socket.id];
      enviarListaTaxis();
    }

    if (infoCanal && infoCanal.socketId === socket.id) {
      canalOcupado = false;
      infoCanal = null;
      io.emit("estadoCanal", { ocupado: false });
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