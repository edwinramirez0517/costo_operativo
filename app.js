let chartTiposInstance = null;
let chartTendenciaInstance = null;
let dtResumen = null;
let dtDetalle = null;
let datosGlobales = [];

$(document).ready(function() {
    // Inicializar DataTables
    dtResumen = $('#tablaResumen').DataTable({
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.4/i18n/es-ES.json' },
        pageLength: 10,
        order: [[3, 'desc']], // Ordenar por gasto mayor
        info: false,
        lengthChange: false
    });

    dtDetalle = $('#tablaDetallada').DataTable({
        language: { url: 'https://cdn.datatables.net/plug-ins/1.13.4/i18n/es-ES.json' },
        pageLength: 15,
        order: [[0, 'desc']]
    });

    // Eventos de los filtros
    $('#filtroTienda, #filtroMes, #filtroSemana').on('change', renderizarDashboard);

    // Evento Drill-down: Clic en la tabla de resumen para ver detalles
    $('#tablaResumen tbody').on('click', 'tr', function () {
        let rowData = dtResumen.row(this).data();
        if (!rowData) return;
        
        let departamento = $(rowData[0]).text() || rowData[0]; 
        
        // Cambiar a la pestaña de detalles
        $('#detalles-tab').tab('show');
        
        // Filtrar la tabla de detalles por este departamento
        dtDetalle.search(departamento).draw();
        $('#btnLimpiarFiltro').show();
    });

    $('#btnLimpiarFiltro').on('click', function() {
        dtDetalle.search('').draw();
        $(this).hide();
    });

    // Iniciar carga automática de datos
    cargarDatosAutomaticamente();
});

// FUNCIÓN PARA JALAR LOS CSV AUTOMÁTICAMENTE
function cargarDatosAutomaticamente() {
    $('#loadingIndicator').show();

    // Promesa para leer ambos archivos locales/GitHub
    Promise.all([
        fetch('combustible_galon.csv').then(res => res.text()).catch(e => ""),
        fetch('combustible_litro.csv').then(res => res.text()).catch(e => "")
    ]).then(([csvGalon, csvLitro]) => {
        
        const configParse = {
            header: true,
            delimiter: ";",
            skipEmptyLines: true,
            transformHeader: function(h) { return h.trim(); }
        };

        if(csvGalon) {
            let dataG = Papa.parse(csvGalon, configParse).data;
            datosGlobales = datosGlobales.concat(dataG.map(r => ({...r, unidad_medida: 'Gal'})));
        }
        
        if(csvLitro) {
            let dataL = Papa.parse(csvLitro, configParse).data;
            datosGlobales = datosGlobales.concat(dataL.map(r => ({...r, unidad_medida: 'Lts'})));
        }

        poblarFiltrosTiempo();
        renderizarDashboard();
        $('#loadingIndicator').hide();
    });
}

function limpiarNumero(val) {
    if (!val) return 0;
    let num = parseFloat(val.toString().replace(/[L\s,]/g, ''));
    return isNaN(num) ? 0 : num;
}

function poblarFiltrosTiempo() {
    let meses = new Set();
    let semanas = new Set();

    datosGlobales.forEach(item => {
        if(item['MES'] && item['MES'].trim() !== '') meses.add(item['MES'].trim().toUpperCase());
        if(item['SEMANA'] && item['SEMANA'].trim() !== '') semanas.add(item['SEMANA'].trim().toUpperCase());
    });

    // Ordenar y agregar al HTML
    Array.from(meses).sort().forEach(m => {
        $('#filtroMes').append(`<option value="${m}">${m}</option>`);
    });
    
    // Extraer número para ordenar semanas correctamente (ej. SEMANA-5 -> 5)
    Array.from(semanas).sort((a,b) => {
        let numA = parseInt(a.replace(/\D/g, '')) || 0;
        let numB = parseInt(b.replace(/\D/g, '')) || 0;
        return numA - numB;
    }).forEach(s => {
        $('#filtroSemana').append(`<option value="${s}">${s}</option>`);
    });
}

function renderizarDashboard() {
    if (datosGlobales.length === 0) return;

    let totalLps = 0, totalGal = 0, totalLit = 0;
    let deptosMap = {}, tiposMap = {}, semanasMap = {};
    let filasResumen = [], filasDetalle = [];
    
    const filtroTienda = $('#filtroTienda').val(); 
    const filtroMes = $('#filtroMes').val();
    const filtroSemana = $('#filtroSemana').val();

    datosGlobales.forEach(item => {
        let solicitante = item['SOLICITANTE'] ? item['SOLICITANTE'].trim().toUpperCase() : 'sin espesificar';
        let vehiculo = item['VEHICULO'] ? item['VEHICULO'].trim() : 'sin espesificar';
        let placa = item['#PLACA'] ? item['#PLACA'].trim() : '-';
        let tipoComb = item['COMBUSTIBLE'] ? item['COMBUSTIBLE'].trim() : 'sin espesificar';
        let fecha = item['FECHA'] ? item['FECHA'].trim() : '-';
        let mes = item['MES'] ? item['MES'].trim().toUpperCase() : '';
        let semana = item['SEMANA'] ? item['SEMANA'].trim().toUpperCase() : '';
        
        if (solicitante === '' || solicitante === '0') solicitante = 'sin espesificar';
        if (vehiculo === '' || vehiculo === '0') vehiculo = 'sin espesificar';
        if (tipoComb === '') tipoComb = 'sin espesificar';

        // Agrupar bodegas en MAYOREO
        if (solicitante.includes('BODEGA') || solicitante.includes('ALMACEN') || solicitante.includes('CEDIS')) {
            solicitante = 'MAYOREO';
        }

        // Aplicar Filtros
        if (filtroTienda !== 'TODOS' && solicitante !== filtroTienda) return;
        if (filtroMes !== 'TODOS' && mes !== filtroMes) return;
        if (filtroSemana !== 'TODAS' && semana !== filtroSemana) return;

        let valorLps = limpiarNumero(item['TOTAL VALOR LPS']);
        let cantidad = limpiarNumero(item['ABASTECIDO']);

        if (valorLps === 0 && cantidad === 0) return;

        // Sumatorias Totales
        totalLps += valorLps;
        if (item.unidad_medida === 'Gal') totalGal += cantidad;
        if (item.unidad_medida === 'Lts') totalLit += cantidad;

        // Agrupar para Gráficos y Resumen
        if (!deptosMap[solicitante]) deptosMap[solicitante] = { galones: 0, litros: 0, costo: 0 };
        deptosMap[solicitante].costo += valorLps;
        if (item.unidad_medida === 'Gal') deptosMap[solicitante].galones += cantidad;
        if (item.unidad_medida === 'Lts') deptosMap[solicitante].litros += cantidad;

        tiposMap[tipoComb] = (tiposMap[tipoComb] || 0) + valorLps;
        semanasMap[semana] = (semanasMap[semana] || 0) + valorLps;

        // Filas para Tabla Detalles
        let badgeClass = item.unidad_medida === 'Gal' ? 'bg-success' : 'bg-info text-dark';
        filasDetalle.push([
            fecha,
            semana,
            `<span class="fw-bold">${solicitante}</span>`,
            `${vehiculo} <br><small class="text-muted">${placa}</small>`,
            tipoComb,
            `<span class="badge ${badgeClass}">${item.unidad_medida}</span>`,
            cantidad.toLocaleString('en-US', {minimumFractionDigits: 2}),
            `<span class="fw-bold text-primary">L. ${valorLps.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>`
        ]);
    });

    // Convertir objeto de resumen a array para DataTables
    for (const [depto, data] of Object.entries(deptosMap)) {
        filasResumen.push([
            `<span class="fw-bold text-primary">${depto}</span>`,
            data.galones.toLocaleString('en-US', {minimumFractionDigits: 2}),
            data.litros.toLocaleString('en-US', {minimumFractionDigits: 2}),
            data.costo
        ]);
    }

    // Actualizar KPIs
    $('#val-costo').text(`L. ${totalLps.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
    $('#val-galones').text(totalGal.toLocaleString('en-US', {maximumFractionDigits: 0}));
    $('#val-litros').text(totalLit.toLocaleString('en-US', {maximumFractionDigits: 0}));
    
    let topDepto = Object.keys(deptosMap).length > 0 ? Object.keys(deptosMap).reduce((a, b) => deptosMap[a].costo > deptosMap[b].costo ? a : b) : '-';
    $('#val-top-depto').text(topDepto);

    // Inyectar a las tablas
    dtResumen.clear();
    filasResumen.forEach(f => {
        // Formatear el costo visualmente pero mantener el valor numérico para ordenar
        let f2 = [...f];
        f2[3] = `L. ${f[3].toLocaleString('en-US', {minimumFractionDigits: 2})}`;
        dtResumen.row.add(f2);
    });
    dtResumen.draw();

    dtDetalle.clear();
    if (filasDetalle.length > 0) dtDetalle.rows.add(filasDetalle);
    dtDetalle.draw();

    dibujarGraficos(tiposMap, semanasMap);
}

function dibujarGraficos(tipos, semanas) {
    if (chartTiposInstance) chartTiposInstance.destroy();
    if (chartTendenciaInstance) chartTendenciaInstance.destroy();

    const ctx1 = document.getElementById('chartTipos').getContext('2d');
    chartTiposInstance = new Chart(ctx1, {
        type: 'doughnut',
        data: {
            labels: Object.keys(tipos),
            datasets: [{ data: Object.values(tipos), backgroundColor: ['#E1251B', '#012094', '#f1c40f', '#2ecc71'] }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '65%' }
    });

    // Ordenar semanas por número para la gráfica de línea
    let semanasOrdenadas = Object.keys(semanas).sort((a,b) => {
        let numA = parseInt(a.replace(/\D/g, '')) || 0;
        let numB = parseInt(b.replace(/\D/g, '')) || 0;
        return numA - numB;
    });
    let valoresSemanas = semanasOrdenadas.map(s => semanas[s]);

    const ctx2 = document.getElementById('chartTendencia').getContext('2d');
    chartTendenciaInstance = new Chart(ctx2, {
        type: 'line',
        data: {
            labels: semanasOrdenadas,
            datasets: [{
                label: 'Costo (Lps)',
                data: valoresSemanas,
                borderColor: '#E1251B',
                backgroundColor: 'rgba(225, 37, 27, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.3
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}
