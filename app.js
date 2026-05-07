// app.js

let chartDeptosInstance = null;
let chartTiposInstance = null;
let dataTableInstance = null;
let datosGlobales = [];

$(document).ready(function() {
    // 1. Inicializar la tabla vacía correctamente
    dataTableInstance = $('#tablaDetallada').DataTable({
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.4/i18n/es-ES.json' },
        pageLength: 15,
        order: [[0, 'desc']] // Ordenar por fecha por defecto
    });

    // 2. Escuchar eventos de la interfaz
    $('#csvFileInput').on('change', manejarArchivos);
    $('#filtroTienda').on('change', renderizarDashboard);
});

function manejarArchivos(event) {
    const archivos = event.target.files;
    if (archivos.length === 0) return;

    datosGlobales = [];
    let archivosProcesados = 0;

    const config = {
        header: true,
        delimiter: ";", // El separador correcto para tus CSV
        skipEmptyLines: true,
        transformHeader: function(h) { return h.trim(); },
        complete: function(results, file) {
            let nombreArchivo = file.name.toLowerCase();
            let unidad = nombreArchivo.includes('galon') || nombreArchivo.includes('galones') ? 'Gal' : 
                        (nombreArchivo.includes('litro') || nombreArchivo.includes('litros') ? 'Lts' : 'Und');

            let datosLimpios = results.data.map(row => ({...row, unidad_medida: unidad}));
            datosGlobales = datosGlobales.concat(datosLimpios);
            archivosProcesados++;

            if (archivosProcesados === archivos.length) {
                renderizarDashboard();
            }
        },
        error: function(error) {
            console.error("Error al procesar el archivo:", error);
        }
    };

    Array.from(archivos).forEach(archivo => {
        Papa.parse(archivo, config);
    });
}

function limpiarNumero(val) {
    if (!val) return 0;
    let num = parseFloat(val.toString().replace(/[L\s,]/g, ''));
    return isNaN(num) ? 0 : num;
}

function renderizarDashboard() {
    if (datosGlobales.length === 0) return;

    let totalLps = 0, totalGal = 0, totalLit = 0;
    let deptos = {}, tipos = {};
    let filasParaTabla = [];
    const filtroTienda = $('#filtroTienda').val(); 

    datosGlobales.forEach(item => {
        // Limpieza y manejo de vacíos ("sin espesificar")
        let solicitante = item['SOLICITANTE'] ? item['SOLICITANTE'].trim().toUpperCase() : 'sin espesificar';
        let vehiculo = item['VEHICULO'] ? item['VEHICULO'].trim() : 'sin espesificar';
        let placa = item['#PLACA'] ? item['#PLACA'].trim() : '-';
        let tipoComb = item['COMBUSTIBLE'] ? item['COMBUSTIBLE'].trim() : 'sin espesificar';
        let proveedor = item['PROVEEDOR'] ? item['PROVEEDOR'].trim() : 'sin espesificar';
        let fecha = item['FECHA'] ? item['FECHA'].trim() : '-';
        
        if (solicitante === '' || solicitante === '0') solicitante = 'sin espesificar';
        if (vehiculo === '' || vehiculo === '0') vehiculo = 'sin espesificar';
        if (tipoComb === '') tipoComb = 'sin espesificar';

        // Agrupar entidades de bodega bajo MAYOREO
        if (solicitante.includes('BODEGA') || solicitante.includes('ALMACEN') || solicitante.includes('CEDIS')) {
            solicitante = 'MAYOREO';
        }

        // Aplicar Filtro Visual
        if (filtroTienda !== 'TODOS') {
            if (solicitante !== filtroTienda) return;
        }

        // Procesar Valores Numéricos
        let valorLps = limpiarNumero(item['TOTAL VALOR LPS']);
        let cantidad = limpiarNumero(item['ABASTECIDO']);

        if (valorLps === 0 && cantidad === 0) return;

        // Sumatorias Generales
        totalLps += valorLps;
        if (item.unidad_medida === 'Gal') totalGal += cantidad;
        if (item.unidad_medida === 'Lts') totalLit += cantidad;

        // Datos para Gráficos
        deptos[solicitante] = (deptos[solicitante] || 0) + valorLps;
        tipos[tipoComb] = (tipos[tipoComb] || 0) + valorLps;

        // Preparar fila para inyectar en DataTables
        let badgeClass = item.unidad_medida === 'Gal' ? 'bg-success' : 'bg-info text-dark';
        
        filasParaTabla.push([
            fecha,
            `<span class="fw-bold">${solicitante}</span>`,
            `${vehiculo} <br><small class="text-muted">${placa}</small>`,
            tipoComb,
            `<span class="badge ${badgeClass}">${item.unidad_medida}</span>`,
            cantidad.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}),
            `<span class="fw-bold text-primary">L. ${valorLps.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>`,
            `<small>${proveedor}</small>`
        ]);
    });

    // Actualizar Tarjetas KPI
    $('#val-costo').text(`L. ${totalLps.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
    $('#val-galones').text(`${totalGal.toLocaleString('en-US', {minimumFractionDigits: 2})} Gal`);
    $('#val-litros').text(`${totalLit.toLocaleString('en-US', {minimumFractionDigits: 2})} Lts`);
    
    let topDepto = Object.keys(deptos).length > 0 ? Object.keys(deptos).reduce((a, b) => deptos[a] > deptos[b] ? a : b) : '-';
    $('#val-top-depto').text(topDepto);

    // Inyectar datos a la tabla sin destruirla (Evita que la pantalla quede en blanco)
    dataTableInstance.clear();
    if (filasParaTabla.length > 0) {
        dataTableInstance.rows.add(filasParaTabla);
    }
    dataTableInstance.draw();

    // Renderizar Gráficos
    dibujarGraficos(deptos, tipos);
}

function dibujarGraficos(deptos, tipos) {
    if (chartDeptosInstance) chartDeptosInstance.destroy();
    if (chartTiposInstance) chartTiposInstance.destroy();

    let deptosOrdenados = Object.entries(deptos).sort((a, b) => b[1] - a[1]);
    let etiquetasDeptos = deptosOrdenados.map(d => d[0]);
    let valoresDeptos = deptosOrdenados.map(d => d[1]);

    const ctx1 = document.getElementById('chartDeptos').getContext('2d');
    chartDeptosInstance = new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: etiquetasDeptos,
            datasets: [{
                label: 'Gasto (Lps)',
                data: valoresDeptos,
                backgroundColor: '#012094',
                borderRadius: 4
            }]
        },
        options: { 
            indexAxis: 'y', 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });

    const ctx2 = document.getElementById('chartTipos').getContext('2d');
    chartTiposInstance = new Chart(ctx2, {
        type: 'doughnut',
        data: {
            labels: Object.keys(tipos),
            datasets: [{
                data: Object.values(tipos),
                backgroundColor: ['#E1251B', '#012094', '#f1c40f', '#2ecc71', '#95a5a6']
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            cutout: '65%'
        }
    });
}
