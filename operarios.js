(() => {
  'use strict';
  const endpoint = 'https://kzvitowvbibolqtkwopq.supabase.co/functions/v1/mediciones';
  const accountKey = 'mediciones.account';
  const draftKey = () => 'mediciones.orders.' + (account()?.token || '');
  const read = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  };
  const account = () => read(accountKey, null);
  const setAccount = value => value ? localStorage.setItem(accountKey, JSON.stringify(value)) : localStorage.removeItem(accountKey);
  const localRecords = () => read(draftKey(), []);
  function saveLocal(record) {
    try { localStorage.setItem(draftKey(), JSON.stringify([record, ...localRecords().filter(item => item.id !== record.id)])); }
    catch { throw new Error('No hay espacio para guardar el pedido. Reduce el número de fotos.'); }
  }
  const removeLocal = id => localStorage.setItem(draftKey(), JSON.stringify(localRecords().filter(item => item.id !== id)));
  async function call(path, user, body) {
    const response = await fetch(endpoint + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(user ? {Authorization: 'Bearer ' + user.token} : {}),
        ...(body ? {'Content-Type': 'application/json'} : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'omit',
      signal: AbortSignal.timeout?.(18000)
    });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error || 'El taller no ha respondido.'), {status: response.status});
    return result;
  }
  function figure(category, type, boxType, parts, fields) {
    const map = mapping => Object.fromEntries(Object.entries(mapping).map(([key, name]) => [key, fields[name].value.trim()]));
    const units = name => Number(fields[name].value) || 1;
    const base = {category, type};
    switch (category) {
      case 'Codos': return {...base, ...map({upper:'upper', upperEnd:'upperEnd', total:'count', needed:'needed', lower:'lower', lowerEnd:'lowerEnd'}), quantity:units('quantity')};
      case 'Reducción': return {...base, ...map({type:'coneType', a:'coneA', b:'coneB', l:'coneLength', kindA:'coneKindA', kindB:'coneKindB', endA:'coneEndA', endB:'coneEndB'}), quantity:units('coneQuantity')};
      case 'Carretes': return {...base, ...map({measurements:'spoolMeasurements', leftEnd:'leftEnd', rightEnd:'rightEnd'}), parts, quantity:units('spoolUnits')};
      case 'Injerto': return {...base, ...map({a:'branchMain', b:'branchHeight', opening:'branchOpening', mainKind:'branchMainKind', openingKind:'branchOpeningKind', termination:'branchEnd', seam:'branchSeam', angle:'branchAngle'}), branchLayout:true, quantity:units('branchUnits')};
      case 'Zeppelin': return {...base, ...map({type:'fittingType', a:'fittingA', b:'fittingB', opening:'fittingOpening', iron:'fittingLast'})};
      case 'Cajas':
      case 'Cajas redondas':
      case 'Cajas redondas con plano': return {...base, ...map({a:'boxA', b:'boxB', c:'boxC', l:'boxL'}), type:boxType};
      case 'Tapas': return {...base, measureKind:fields.capDevelopment.value.trim() ? 'Desarrollo' : 'Diámetro',
        measurements:(fields.capDevelopment.value || fields.capDiameter.value).trim(), quantity:units('capQuantity')};
      default: throw new Error('Figura no reconocida.');
    }
  }
  async function jpeg(source) {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    for (const size of [1024, 800, 600, 420, 280]) {
      const scale = Math.min(1, size / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const encoded = canvas.toDataURL('image/jpeg', 0.74).split(',')[1];
      if (encoded.length <= 218452) return encoded;
    }
    throw new Error('No se pudo reducir una foto.');
  }
  async function send(order, user) {
    const figures = [];
    for (const item of order.figures) {
      const photos = [];
      for (const photo of item.photos) {
        await call('/photos', user, {id: photo.id, image: photo.source.split(',')[1]});
        photos.push(photo.id);
      }
      figures.push({...item, photos});
    }
    return call('/orders', user, {order: {
      id:order.id, factoryId:order.factoryId, line:order.references.join(' / '),
      noLine:!order.references.length, additional:order.additional, perFigure:true, figures
    }});
  }
  function record(entry) {
    const order = entry.order;
    const figures = (order.figures || (order.groups || []).flatMap(group => group.figures || [])).map(item => ({
      ...item, text:item.text || [item.category, item.type, item.measurements].filter(Boolean).join(' · '), photos:item.photos || []
    }));
    return {id:entry.id, factoryId:order.factoryId, figures, additional:order.additional,
      references:[...new Set(figures.map(item => item.line).filter(Boolean))].concat(
        !order.perFigure && order.line ? [order.line] : []),
      montage:[entry.factory, entry.montage && 'Montaje ' + entry.montage].filter(Boolean).join(' · '),
      date:new Date(entry.sent).toLocaleDateString('es-ES'), sent:true, made:Boolean(entry.made)};
  }
  function photoElement(photo, number, user) {
    const image = document.createElement('img');
    image.alt = 'Foto ' + number;
    if (typeof photo === 'string') {
      call('/photos/' + encodeURIComponent(photo), user).then(data => {
        image.src = 'data:image/jpeg;base64,' + data.image;
      }).catch(() => { image.alt = 'Foto no disponible'; });
    } else image.src = photo.source;
    return image;
  }
  window.Mediciones = {account, setAccount, localRecords, saveLocal, removeLocal, call, figure, send, record, photoElement, jpeg};
})();
