"""SSE stream for manager dashboards.

Tiny in-process pub-sub. Each connected client gets a queue; section/upload
write paths call publish() to push events to all connected queues. Single
worker only (gunicorn -w 1) — fine for our single-droplet deployment.
"""

import json
import queue
import time
from flask import Blueprint, Response, request

stream_bp = Blueprint('stream', __name__)

_subscribers = []  # list of queue.Queue


def publish(event):
    """Send a JSON-serializable dict to every connected client."""
    payload = json.dumps(event, ensure_ascii=False)
    dead = []
    for q in _subscribers:
        try:
            q.put_nowait(payload)
        except Exception:
            dead.append(q)
    for q in dead:
        try:
            _subscribers.remove(q)
        except ValueError:
            pass


@stream_bp.route('/api/manager/stream', methods=['GET'])
def stream():
    q = queue.Queue(maxsize=64)
    _subscribers.append(q)

    def gen():
        try:
            yield 'retry: 5000\n\n'  # client reconnect delay
            yield ': connected\n\n'   # comment line, keeps connection warm
            last_ping = time.time()
            while True:
                try:
                    msg = q.get(timeout=15)
                    yield 'data: ' + msg + '\n\n'
                except queue.Empty:
                    # heartbeat — comment so clients/proxies know we're alive
                    if time.time() - last_ping >= 15:
                        yield ': ping\n\n'
                        last_ping = time.time()
        except GeneratorExit:
            pass
        finally:
            try:
                _subscribers.remove(q)
            except ValueError:
                pass

    headers = {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        'Connection': 'keep-alive',
    }
    return Response(gen(), headers=headers)
