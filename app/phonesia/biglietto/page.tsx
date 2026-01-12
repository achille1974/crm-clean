export default function BigliettoPhonesiaPage() {
  return (
    <main className="min-h-screen bg-white flex justify-center">
      <div className="w-full max-w-md px-6 py-10">

        {/* LOGO PHONESIA */}
        <div className="mb-10 flex justify-center">
          <img
            src="/phonesia/Logo_Phonesia-1.png"
            alt="PHONESIA"
            className="w-[260px] h-auto"
          />
        </div>

        {/* FOTO GRUPPO */}
        <div className="mb-10">
          <img
            src="/phonesia/biglietto/gruppo-phonesia.png"
            alt="Team PHONESIA"
            className="w-full rounded-xl object-cover"
          />
        </div>

        {/* TESTO IDENTITÀ */}
        <div className="text-gray-800 space-y-5 text-base leading-relaxed text-center mb-14">
          <p className="text-lg font-semibold">Siamo un negozio su strada.</p>
          <p>Ci trovi qui oggi, domani e nel tempo.</p>

          <p>
            I nostri numeri sono a tua disposizione{" "}
            <strong>sia telefonicamente che su WhatsApp</strong>,{" "}
            per aiutarti, consigliarti e seguirti in tutto ciò che trattiamo.
          </p>

          <p>
            Non siamo un call center.
            <br />
            Non siamo un punto vendita temporaneo.
            <br />
            Non siamo persone che oggi ci sono e domani spariscono.
          </p>

          <p>
            Siamo consulenti reali,
            <br />
            con un negozio reale
            <br />
            e un rapporto umano che continua anche dopo l’acquisto.
          </p>

          <p>
            Quando hai bisogno, sai dove trovarci.
            <br />
            E sai chi risponde.
          </p>

          <p className="text-lg font-semibold">Noi siamo PHONESIA.</p>
        </div>

        {/* CONTATTI */}
        <section className="space-y-14">

          {/* RESPONSABILE */}
          <div>
            <h2 className="text-lg font-semibold mb-3">
              Responsabile PHONESIA (tutti i negozi)
            </h2>
            <p className="font-medium">Marco Magnano</p>
            <a href="tel:+393312572365" className="block text-blue-600">
              📞 +39 331 257 2365
            </a>
            <a href="https://wa.me/393312572365" className="block text-green-600">
              💬 WhatsApp
            </a>
          </div>

          {/* PHONESIA FLORIDIA */}
          <div>
            <h2 className="text-lg font-semibold mb-1">PHONESIA FLORIDIA</h2>
            <a
              href="https://www.google.com/maps/search/?api=1&query=Corso+Vittorio+Emanuele+735+Floridia"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-gray-600 mb-4 underline"
            >
              📍 Corso Vittorio Emanuele 735/737 – Floridia
            </a>

            <p className="font-medium">Alba</p>
            <a href="tel:+393349474319" className="block text-blue-600">
              📞 +39 334 947 4319
            </a>
            <a href="https://wa.me/393349474319" className="block text-green-600">
              💬 WhatsApp
            </a>

            <p className="font-medium mt-4">Rosy</p>
            <a href="tel:+393282607113" className="block text-blue-600">
              📞 +39 328 260 7113
            </a>
            <a href="https://wa.me/393282607113" className="block text-green-600">
              💬 WhatsApp
            </a>

            <p className="font-medium mt-4">Lorenzo</p>
            <a href="tel:+393274119982" className="block text-blue-600">
              📞 +39 327 411 9982
            </a>
            <a href="https://wa.me/393274119982" className="block text-green-600">
              💬 WhatsApp
            </a>
          </div>

          {/* PHONESIA AUGUSTA */}
          <div>
            <h2 className="text-lg font-semibold mb-1">PHONESIA AUGUSTA</h2>
            <a
              href="https://www.google.com/maps/search/?api=1&query=Viale+Italia+195+Augusta"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-gray-600 mb-4 underline"
            >
              📍 Viale Italia 195/197 – Augusta
            </a>

            <p className="font-medium">Federico</p>
            <a href="tel:+393202927455" className="block text-blue-600">
              📞 +39 320 292 7455
            </a>
            <a href="https://wa.me/393202927455" className="block text-green-600">
              💬 WhatsApp
            </a>

            <p className="font-medium mt-4">Damiano</p>
            <a href="tel:+393761162326" className="block text-blue-600">
              📞 +39 376 116 2326
            </a>
            <a href="https://wa.me/393761162326" className="block text-green-600">
              💬 WhatsApp
            </a>
          </div>

          {/* PHONESIA SIRACUSA */}
          <div>
            <h2 className="text-lg font-semibold mb-1">PHONESIA SIRACUSA</h2>
            <a
              href="https://www.google.com/maps/search/?api=1&query=Corso+Gelone+41+Siracusa"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-gray-600 mb-4 underline"
            >
              📍 Corso Gelone 41 – Siracusa
            </a>

            <p className="font-medium">Andrea</p>
            <a href="tel:+393662000815" className="block text-blue-600">
              📞 +39 366 200 0815
            </a>
            <a href="https://wa.me/393662000815" className="block text-green-600">
              💬 WhatsApp
            </a>
          </div>

          {/* PHONESIA AVOLA */}
          <div>
            <h2 className="text-lg font-semibold mb-1">PHONESIA AVOLA</h2>
            <a
              href="https://www.google.com/maps/search/?api=1&query=Corso+Vittorio+Emanuele+281+Avola"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-gray-600 mb-4 underline"
            >
              📍 Corso Vittorio Emanuele 281/283 – Avola
            </a>

            <p className="font-medium">Gaetano</p>
            <a href="tel:+393917510115" className="block text-blue-600">
              📞 +39 391 751 0115
            </a>
            <a href="https://wa.me/393917510115" className="block text-green-600">
              💬 WhatsApp
            </a>
          </div>

          {/* PHONESIA TABACCHI BELTRAMI */}
          <div>
            <h2 className="text-lg font-semibold mb-1">
              PHONESIA TABACCHI BELTRAMI
            </h2>
            <a
              href="https://www.google.com/maps/search/?api=1&query=Via+Archimede+202+Siracusa"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-gray-600 mb-4 underline"
            >
              📍 Via Archimede 202 – Siracusa
            </a>

            <p className="font-medium">Achille</p>
            <a href="tel:+393473214561" className="block text-blue-600">
              📞 +39 347 321 4561
            </a>
            <a href="https://wa.me/393473214561" className="block text-green-600">
              💬 WhatsApp
            </a>
          </div>

        </section>
      </div>
    </main>
  );
}
